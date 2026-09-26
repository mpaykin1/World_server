/**
 * Graphics-only chunk mesh upload scheduler. Original implementation.
 * CPU worker results are uploaded on the render thread under an explicit
 * per-frame cost budget; no worker, renderer or backend is created here.
 */
export function createChunkUploadQueue({maxPending = 256} = {}) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new RangeError('maxPending');
  const pending = new Map();
  let sequence = 0;
  const valid = entry => entry && typeof entry.id === 'string' &&
    Number.isSafeInteger(entry.revision) && entry.revision >= 0 &&
    Number.isFinite(entry.costMs) && entry.costMs > 0 &&
    typeof entry.upload === 'function';
  return Object.freeze({
    enqueue(entry) {
      if (!valid(entry)) throw new TypeError('invalid chunk upload');
      const old = pending.get(entry.id);
      if (old && old.revision >= entry.revision) return false;
      if (!old && pending.size >= maxPending) return false;
      pending.set(entry.id, {...entry, sequence: old?.sequence ?? sequence++});
      return true;
    },
    invalidate(id, throughRevision = Infinity) {
      const old = pending.get(id);
      if (old && old.revision <= throughRevision) return pending.delete(id);
      return false;
    },
    get size() { return pending.size; },
    drain({budgetMs, isVisible = () => true, isCurrent = () => true} = {}) {
      if (!Number.isFinite(budgetMs) || budgetMs < 0) throw new RangeError('budgetMs');
      const ordered = [...pending.values()].sort((a, b) =>
        Number(Boolean(isVisible(b.id))) - Number(Boolean(isVisible(a.id))) ||
        (b.priority ?? 0) - (a.priority ?? 0) || a.sequence - b.sequence);
      let spentMs = 0, uploaded = 0, stale = 0;
      for (const entry of ordered) {
        if (!pending.has(entry.id) || pending.get(entry.id).revision !== entry.revision) continue;
        if (!isCurrent(entry.id, entry.revision)) {
          pending.delete(entry.id); stale++; continue;
        }
        if (spentMs + entry.costMs > budgetMs) continue;
        // Remove only after successful upload, so a thrown GPU error can be retried.
        entry.upload();
        pending.delete(entry.id);
        spentMs += entry.costMs;
        uploaded++;
      }
      return {spentMs, uploaded, stale, remaining: pending.size};
    }
  });
}
