import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { startRuntime } from './server.mjs';
import { RuntimeStartupError } from './errors.mjs';

export async function main(args = process.argv.slice(2), options = {}) {
  const log = (event, fields = {}) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
  try {
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--config')) {
      throw new RuntimeStartupError('INVALID_ARGUMENTS', 'Usage: node runtime/src/main.mjs [--config CONFIG_FILE]');
    }
    log('runtime starting');
    const config = options.config ?? await loadConfig(args[1]);
    log('config loaded');
    const runtime = await startRuntime(config, options);
    log('listener bound', { host: config.host, port: config.port, runtimeVersion: runtime.state.runtimeVersion,
      apiVersion: runtime.state.apiVersion, health: runtime.state.status });
    void runtime.initialized.then(() => {
      const state = runtime.state;
      log('engine initialization complete', { health: state.status, model: state.modelId,
        ...(state.error ? { code: state.error.code } : {}) });
    });
    let shutdownTask;
    let fatalTimer;
    const fatal = () => {
      // Never render the exception, stack, request or native diagnostic.
      process.exitCode = 1;
      log('runtime fatal', { code: 'INTERNAL_ERROR' });
      fatalTimer ??= setTimeout(() => process.exit(1), 4000);
      void shutdown().finally(() => { clearTimeout(fatalTimer); process.exit(1); });
    };
    const shutdown = () => {
      if (shutdownTask) return shutdownTask;
      shutdownTask = (async () => {
        log('shutdown started');
        try { await runtime.close(); log('shutdown complete'); }
        catch { log('shutdown failed', { code: 'INTERNAL_ERROR' }); process.exitCode = 1; }
        finally {
          process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown);
          process.removeListener('uncaughtException', fatal); process.removeListener('unhandledRejection', fatal);
        }
      })();
      return shutdownTask;
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', fatal);
    process.on('unhandledRejection', fatal);
    runtime.server.on('error', () => {
      log('listener failed', { code: 'INTERNAL_ERROR' });
      process.exitCode = 1;
      void shutdown();
    });
    return runtime;
  } catch (error) {
    console.error(JSON.stringify({ event: 'runtime startup failed', code: error instanceof RuntimeStartupError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof RuntimeStartupError ? error.message : 'Runtime startup failed.' }));
    process.exitCode = 1;
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
