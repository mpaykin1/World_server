export async function prewarmShadersV9(gl, entries, compileVariant, {maxMs=120, maxVariants=64}={}) {
  const start=performance.now(), result={compiled:0,failed:0,truncated:false};
  for (const entry of (entries||[]).slice(0,maxVariants)) {
    if (performance.now()-start > maxMs) { result.truncated=true; break; }
    try { await compileVariant(gl, entry); result.compiled++; } catch (_) { result.failed++; }
    await Promise.resolve();
  }
  return result;
}
