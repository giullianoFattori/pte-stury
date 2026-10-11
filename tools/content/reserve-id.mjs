import { reserveId } from './ids.mjs';
import { rejectAuthor, authorFailure } from './author-errors.mjs';
try {
  if (process.argv.length !== 3) rejectAuthor('INVALID_ARGUMENTS', 'Usage: content:reserve-id -- <implemented-task>');
  console.log(JSON.stringify(await reserveId(process.argv[2]), null, 2));
} catch (error) { authorFailure(error); }
