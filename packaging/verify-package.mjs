import { verifyPackage } from './inventory.mjs';
try {
  if (process.argv.length !== 3) throw new Error('Usage: node packaging/verify-package.mjs PACKAGE_ROOT');
  const manifest = await verifyPackage(process.argv[2]);
  console.log(JSON.stringify({ event: 'package verified', target: manifest.target, artifacts: manifest.artifacts.length, bytes: manifest.artifacts.reduce((n, a) => n + a.size, 0) }));
} catch { console.error('Package verification failed.'); process.exitCode = 1; }
