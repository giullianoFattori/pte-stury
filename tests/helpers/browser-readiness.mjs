// Test-only readiness: warm the Vite graph before Chrome loads a fresh profile.
// This probes startup, never retries a failed product assertion or creates sessions.
export async function waitForBrowserServer(server, url, entry = '/src/main.tsx') {
  let timer;
  try {
    await Promise.race([
      (async () => {
        if (entry) { await server.warmupRequest(entry); await server.waitForRequestsIdle(); }
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (response.status !== 200 || !(await response.text()).includes('id="root"')) throw new Error('Browser harness HTML readiness failed');
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser harness readiness deadline')), 30000); }),
    ]);
  } catch (error) { await server.close(); throw error; }
  finally { clearTimeout(timer); }
}
