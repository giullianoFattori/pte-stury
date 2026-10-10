import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const go = resolve('.local-packaging/go/bin/go');
for (const [target, GOOS, GOARCH] of [['linux-x64','linux','amd64'],['windows-x64','windows','amd64'],['macos-x64','darwin','amd64'],['macos-arm64','darwin','arm64']]) {
  await mkdir(`.local-packaging/launchers/${target}`, { recursive: true });
  const args = ['build', '-trimpath', '-buildvcs=false', '-ldflags=-s -w', '-o', resolve(`.local-packaging/launchers/${target}/launcher${GOOS === 'windows' ? '.exe' : ''}`), '.'];
  const result = spawnSync(go, args, { cwd: 'packaging/launcher', stdio: 'inherit', env: { ...process.env, CGO_ENABLED: '0', GOOS, GOARCH, GOTOOLCHAIN: 'local', GOCACHE: resolve('.local-packaging/go-cache') } });
  if (result.status !== 0) throw new Error('Launcher build failed');
  console.log(JSON.stringify({ event: 'launcher compiled', target, validatedOnTarget: false }));
}
