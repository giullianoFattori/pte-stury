import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { runNative, configurePackagedLibraries } from '../../runtime/src/nativeProcess.mjs';
import { createMediaIntegrity, SYSTEM_MEDIA_TOOLS } from '../../runtime/src/media.mjs';

export class ImageIntegrityError extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new ImageIntegrityError(code, message); };
const MAX_BYTES = 20 * 1024 * 1024, MAX_DIMENSION = 16384, MAX_PIXELS = 40_000_000;
const TYPES = { '.png': ['image/png', 'png'], '.jpg': ['image/jpeg', 'jpeg'], '.jpeg': ['image/jpeg', 'jpeg'], '.webp': ['image/webp', 'webp'] };
const signature = (bytes, ext) => ext === '.png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  : ext === '.jpg' || ext === '.jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  : ext === '.webp' ? bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' : false;
const identity = s => [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');
function checked(value, code, message) { if (!value) fail(code, message); }
export async function resolveImagePath(authoredPath, imageRoot = resolve('public/images')) {
  if (typeof authoredPath !== 'string' || !authoredPath.startsWith('/images/') || authoredPath.length > 512 || authoredPath.includes('\\') || authoredPath.includes('\0')) fail('IMAGE_PATH_INVALID','Expected a safe local /images/ path.');
  const root=resolve(imageRoot), target=resolve(root,authoredPath.slice('/images/'.length)), rel=relative(root,target);
  if (!rel || rel==='..' || rel.startsWith('..'+sep) || resolve(root,rel)!==target || rel.split(sep).some(c=>!c || c==='.' || c==='..')) fail('IMAGE_PATH_INVALID','Image path must remain beneath the managed image root.');
  let dir=root;
  for(const part of rel.split(sep).slice(0,-1)){ const stat=await lstat(dir); checked(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(dir)===dir,'IMAGE_PATH_INVALID','Image path contains an unsafe directory.'); dir=resolve(dir,part); }
  const stat=await lstat(dir); checked(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(dir)===dir,'IMAGE_PATH_INVALID','Image path contains an unsafe directory.');
  return target;
}
export async function createImageMedia(tools) {
  if(!tools){ if(process.platform==='linux') tools=SYSTEM_MEDIA_TOOLS; else { const target=process.platform==='win32'&&process.arch==='x64'?'windows-x64':process.platform==='darwin'&&['x64','arm64'].includes(process.arch)?'macos-'+process.arch:undefined; if(!target) fail('IMAGE_TOOLS_UNAVAILABLE','Local image decoder is unavailable.'); const root=resolve('.local-packaging/inputs',target,'native'),suffix=process.platform==='win32'?'.exe':'';configurePackagedLibraries(root);tools={ffmpeg:resolve(root,'ffmpeg'+suffix),ffprobe:resolve(root,'ffprobe'+suffix)}; } }
  const integrity=await createMediaIntegrity(tools);
  async function run(exe,args,code){await integrity.verify();try{const out=await runNative(exe,args,{signal:new AbortController().signal,timeoutMs:30000,unavailable:()=>new ImageIntegrityError(code,'Local image validation failed.'),failed:()=>new ImageIntegrityError(code,'Local image validation failed.'),timeout:()=>new ImageIntegrityError(code,'Local image validation timed out.')});await integrity.verify();return out;}catch(e){throw e instanceof ImageIntegrityError?e:new ImageIntegrityError(code,'Local image validation failed.');}}
  const input=path=>['-max_alloc','16777216','-max_pixels',String(MAX_PIXELS),'-protocol_whitelist','file','-format_whitelist','image2','-f','image2','-i',path];
  return { async probe(path){try{return JSON.parse((await run(tools.ffprobe,['-v','error',...input(path),'-select_streams','v:0','-show_entries','stream=codec_type,codec_name,width,height','-of','json'],'IMAGE_DECODE_FAILED')).toString('utf8'));}catch(e){if(e instanceof ImageIntegrityError)throw e;fail('IMAGE_DECODE_FAILED','Image metadata could not be decoded.');}},
    async decode(path){try{const result=JSON.parse((await run(tools.ffprobe,['-v','error',...input(path),'-select_streams','v:0','-show_frames','-show_entries','frame=width,height','-of','json'],'IMAGE_DECODE_FAILED')).toString('utf8'));checked(Array.isArray(result.frames)&&result.frames.length===1,'IMAGE_DECODE_FAILED','Image must decode to exactly one frame.');}catch(e){if(e instanceof ImageIntegrityError)throw e;fail('IMAGE_DECODE_FAILED','Image pixels could not be decoded.');}} };
}
async function inspect(asset,root,media){
  const path=await resolveImagePath(asset.path,root),before=await lstat(path),ext=extname(path),declared=TYPES[ext];
  checked(declared,'IMAGE_EXTENSION_UNSUPPORTED','Only PNG, JPEG and WebP image files are supported.');
  checked(before.isFile()&&!before.isSymbolicLink(),'IMAGE_NOT_REGULAR_FILE','Image must be a regular file.');
  checked(before.size>0&&before.size<=MAX_BYTES,'IMAGE_SIZE_INVALID','Image must be between 1 byte and 20 MiB.');
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try {
    checked(identity(await handle.stat())===identity(before),'IMAGE_CHANGED','Image changed while opening.');
    const hash=createHash('sha256'),buf=Buffer.alloc(65536);let n=0,head=Buffer.alloc(0);
    for(;;){const {bytesRead}=await handle.read(buf,0,buf.length,null);if(!bytesRead)break;if(!n)head=Buffer.from(buf.subarray(0,Math.min(bytesRead,16)));n+=bytesRead;checked(n<=MAX_BYTES,'IMAGE_SIZE_INVALID','Image grew beyond 20 MiB.');hash.update(buf.subarray(0,bytesRead));}
    checked(signature(head,ext),'IMAGE_MIME_MISMATCH','Image extension does not match its file signature.');
    const actualHash=hash.digest('hex');checked(identity(await lstat(path))===identity(before),'IMAGE_CHANGED','Image changed during validation.');
    const info=await media.probe(path),streams=info.streams;checked(Array.isArray(streams)&&streams.length===1&&streams[0].codec_type==='video','IMAGE_DECODE_FAILED','Image must decode as exactly one still-image stream.');
    const expectedCodec=ext==='.png'?'png':ext==='.webp'?'webp':'mjpeg';checked(streams[0].codec_name===expectedCodec,'IMAGE_MIME_MISMATCH','Decoded image codec does not match its file extension.');
    const width=Number(streams[0].width),height=Number(streams[0].height);checked(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=MAX_DIMENSION&&height<=MAX_DIMENSION&&width*height<=MAX_PIXELS,'IMAGE_DIMENSIONS_INVALID','Image dimensions exceed the supported policy.');
    await media.decode(path);checked(identity(await lstat(path))===identity(before),'IMAGE_CHANGED','Image changed during decode.');
    checked(asset.mediaType===declared[0],'IMAGE_MIME_MISMATCH','Declared media type does not match the file extension.');
    checked(asset.sha256===actualHash,'IMAGE_HASH_MISMATCH','Declared SHA-256 does not match image bytes.');
    checked(asset.bytes===n,'IMAGE_BYTES_MISMATCH','Declared byte count does not match image bytes.');
    checked(asset.width===width,'IMAGE_WIDTH_MISMATCH','Declared width does not match decoded width.');checked(asset.height===height,'IMAGE_HEIGHT_MISMATCH','Declared height does not match decoded height.');
    return {path:asset.path,sha256:actualHash,bytes:n,mediaType:declared[0],width,height};
  }finally{await handle.close();}
}
export async function validateImageAssets(items,{imageRoot=resolve('public/images'),media}={}){
  const errors=[],assets=[],cache=new Map();let checker=media;
  for(const item of items){const asset=item.taskData?.image;if(!asset)continue;try{const key=JSON.stringify(asset);if(!cache.has(key)){checker??=await createImageMedia();cache.set(key,inspect(asset,imageRoot,checker));}assets.push(await cache.get(key));}catch(e){errors.push({file:`content/${item.taskType}/${item.id}.json`,path:'taskData.image',code:e instanceof ImageIntegrityError?e.code:e.code==='ENOENT'?'IMAGE_NOT_FOUND':'IMAGE_CHECK_FAILED',message:e instanceof ImageIntegrityError?e.message:e.code==='ENOENT'?'Referenced image does not exist.':'Image could not be validated safely.'});}}
  return {errors,assets,stats:{referencedAssets:new Set(items.map(i=>i.taskData?.image?.path).filter(Boolean)).size,validatedAssets:new Set(assets.map(a=>a.path)).size,totalBytes:[...new Map(assets.map(a=>[a.path,a])).values()].reduce((n,a)=>n+a.bytes,0)}};
}
