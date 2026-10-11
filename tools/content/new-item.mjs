import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { reserveId } from './ids.mjs';
import { parseQuestionBankItem } from '../../src/domain/content/validation.ts';
import { randomUUID } from 'node:crypto';
import { withRegistryLock, readRegistry, currentSources, checkSourceReservations } from './ids.mjs';
import { installDraftBatch } from './author-install.mjs';
import { AuthorError, rejectAuthor, authorFailure } from './author-errors.mjs';
export async function newItem(taskType, { root = resolve('content'), installOptions, registryOptions } = {}) {
  // Reserve first, irreversibly. Scaffolding failure never releases this identity.
  const { id } = await reserveId(taskType, { root, registryOptions });
  try {
    return await withRegistryLock(root, async () => {
      checkSourceReservations(await readRegistry(root), await currentSources(root));
      const item = parseQuestionBankItem({ id, taskType, difficulty: 1, prompt: 'Draft: replace this prompt before review.', revision: 1, status: 'draft', source: 'internal' });
      const history = { batchId: randomUUID(), source: 'internal', inputFilename: 'content-new', importedAt: new Date().toISOString(), itemIds: [id] };
      await installDraftBatch(root, [item], history, async () => {}, installOptions);
      return { success: true, taskType, id, file: `content/${taskType}/${id}.json`, status: 'draft' };
    });
  } catch (error) { const failure = error instanceof AuthorError ? error : new AuthorError('AUTHOR_WRITE_FAILED', 'Scaffolding failed safely.'); failure.reservedIds = [id]; throw failure; }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
  try { if (process.argv.length !== 3) rejectAuthor('INVALID_ARGUMENTS', 'Usage: content:new -- <implemented-task>'); console.log(JSON.stringify(await newItem(process.argv[2]), null, 2)); }
  catch (error) { authorFailure(error); }
}
