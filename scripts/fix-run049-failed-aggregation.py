from pathlib import Path
p=Path('scripts/science-h4-critic-revision-ab-v2.cjs')
s=p.read_text(encoding='utf-8')
old="collective:{output:revision.output,ms:draft.ms+critique.ms+revision.ms,timeout:draft.timeout||critique.timeout||revision.timeout,...score(revision.output,e)}"
new="collective:{output:revision.output,ms:draft.ms+critique.ms+revision.ms,failed:Boolean(draft.failed||critique.failed||revision.failed),...score(revision.output,e)}"
if old not in s:
    raise SystemExit('target not found')
p.write_text(s.replace(old,new),encoding='utf-8')
print('patched')
