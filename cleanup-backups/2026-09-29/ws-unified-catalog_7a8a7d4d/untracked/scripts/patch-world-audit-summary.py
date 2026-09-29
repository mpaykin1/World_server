from pathlib import Path
p = Path(__file__).resolve().parent / 'world-fleet-audit.js'
s = p.read_text(encoding='utf-8')
old = """  const summary={generatedAt:new Date().toISOString(),total:worlds.length,completed:rows.length,
    pass:rows.filter(r=>r.status==='PASS').length,fail:rows.filter(r=>r.status==='FAIL').length};"""
new = """  const localRows=rows.filter(r=>r.source==='local'); const legacyRows=rows.filter(r=>r.source==='external');
  const summary={generatedAt:new Date().toISOString(),total:worlds.length,completed:rows.length,
    pass:rows.filter(r=>r.status==='PASS').length,fail:rows.filter(r=>r.status==='FAIL').length,
    localPass:localRows.filter(r=>r.status==='PASS').length,localFail:localRows.filter(r=>r.status==='FAIL').length,
    legacyPass:legacyRows.filter(r=>r.status==='PASS').length,legacyFail:legacyRows.filter(r=>r.status==='FAIL').length,
    currentBatchReady:localRows.length>0&&localRows.every(r=>r.status==='PASS')};"""
if old not in s:
    raise SystemExit('target block not found')
p.write_text(s.replace(old,new),encoding='utf-8')
print('patched')