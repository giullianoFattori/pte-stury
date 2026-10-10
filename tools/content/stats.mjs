import { prepareBank } from './pipeline.mjs';
import { reportFailure } from './build.mjs';

try { const result = await prepareBank(); console.log(JSON.stringify({ success: true, ...result.stats, warnings: result.warnings, contentVersion: result.manifest.contentVersion }, null, 2)); }
catch (error) { reportFailure(error); }
