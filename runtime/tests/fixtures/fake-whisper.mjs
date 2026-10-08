#!/usr/bin/env node
// Test executable only. Controls are owned files alongside this copied fixture;
// nothing here is exposed through the runtime's HTTP/config surface.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const control = JSON.parse(await readFile(join(root, 'mode.json'), 'utf8'));
await writeFile(join(root, 'args.json'), JSON.stringify(process.argv.slice(2)));
await writeFile(join(root, 'pid'), String(process.pid));
switch (control.mode) {
  case 'slow': setInterval(() => {}, 1000); break;
  case 'fail': process.stderr.write('native secret /private/learner.wav'); process.exitCode = 7; break;
  case 'stdout-cap': process.stdout.write('x'.repeat(131072)); setInterval(() => {}, 1000); break;
  case 'stderr-cap': process.stderr.write('x'.repeat(131072)); setInterval(() => {}, 1000); break;
  case 'empty': process.stdout.write(' \n'); break;
  case 'invalid-utf8': process.stdout.write(Buffer.from([0xff, 0xfe])); break;
  default: process.stdout.write(control.text ?? ' The university library will remain open. ');
}
