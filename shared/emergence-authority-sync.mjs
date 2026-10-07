// Supabase broadcasts are untrusted notifications, never authoritative world data.
// The database is the source of truth; coalesce/rate-limit reads during floods.
export function createEmergenceAuthoritySync({
  read, apply, revision, clock = Date.now,
  defer = (fn, ms) => setTimeout(fn, ms), minimumIntervalMs = 750,
  warn = message => console.warn('[EMERGENCE_SYNC]', message)
} = {}) {
  if ([read, apply, revision].some(fn => typeof fn !== 'function')) {
    throw new TypeError('Authority sync needs read, apply, and revision callbacks');
  }
  let inFlight = null, timer = null, queued = false, lastRead = -Infinity;
  function schedule() {
    queued = true;
    if (inFlight || timer) return inFlight || Promise.resolve();
    const remaining = Math.max(0, minimumIntervalMs - (clock() - lastRead));
    if (remaining) {
      timer = defer(() => { timer = null; void schedule(); }, remaining);
      return Promise.resolve();
    }
    queued = false;
    lastRead = clock();
    inFlight = Promise.resolve().then(read).then(result => {
      const state = result?.emergence;
      const serverRevision = Number(state?.revision);
      if (state?.schemaVersion !== '1.0.0' ||
          !Number.isSafeInteger(serverRevision) || serverRevision < 1) {
        throw new Error('Authoritative emergence snapshot is invalid');
      }
      // Ignore a read that completed behind a newer locally confirmed mutation.
      if (serverRevision >= revision()) apply(state);
      return state;
    }).catch(error => {
      warn(String(error?.message || error));
      return null;
    }).finally(() => {
      inFlight = null;
      if (queued) void schedule();
    });
    return inFlight;
  }
  function signal(payload) {
    const next = Number(payload?.revision);
    if (payload?.schemaVersion !== '1.0.0' ||
        !Number.isSafeInteger(next) || next <= revision()) return false;
    void schedule();
    return true;
  }
  return { signal, refresh: schedule };
}
