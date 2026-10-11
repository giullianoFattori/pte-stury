export class AuthorError extends Error {
  constructor(code, message, path = '$', extra = {}) { super(message); this.issues = [{ code, message, path }]; Object.assign(this, extra); }
}
export const rejectAuthor = (code, message, path) => { throw new AuthorError(code, message, path); };
export function authorFailure(error) {
  console.log(JSON.stringify({ success: false, errors: error.issues ?? error.errors ?? [{ code: 'AUTHOR_IO_FAILED', path: '$', message: 'Authoring operation failed safely.' }],
    warnings: error.warnings ?? [], reservedIds: error.reservedIds ?? [], recoveryRequired: error.recoveryRequired ?? false }, null, 2));
  process.exitCode = 1;
}
