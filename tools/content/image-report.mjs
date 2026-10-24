import { prepareBank } from './pipeline.mjs';
import { reportFailure } from './build.mjs';
try { const result=await prepareBank();console.log(JSON.stringify({success:true,...result.images.stats,assets:result.images.assets},null,2)); }
catch(error){reportFailure(error);}
