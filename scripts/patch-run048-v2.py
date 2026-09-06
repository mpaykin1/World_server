from pathlib import Path
src=Path('scripts/science-h4-critic-revision-ab.cjs')
dst=Path('scripts/science-h4-critic-revision-ab-v2.cjs')
s=src.read_text(encoding='utf-8')
s=s.replace("const R=process.cwd(),SEED=48048,TIMEOUT=15000;","const R=process.cwd(),SEED=48049,MAXTOK=60;")
a=s.index('async function ask(')
b=s.index('\nasync function memory(',a)
new="""async function ask(model,prompt,seed){const st=Date.now();try{const r=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,prompt,stream:false,think:false,options:{seed,temperature:0,num_predict:MAXTOK}})});if(!r.ok)throw new Error('HTTP '+r.status);const j=await r.json();return{output:j.response||'',ms:Date.now()-st,ollamaTotalMs:(j.total_duration||0)/1e6,evalMs:(j.eval_duration||0)/1e6,evalCount:j.eval_count||0,failed:false}}catch(e){return{output:'',ms:Date.now()-st,failed:true,errorMessage:String(e?.message||e)}}}"""
s=s[:a]+new+s[b:]
s=s.replace("experiment:'RUN_048_H4_CRITIC_REVISION_AB'","experiment:'RUN_049_H4_CRITIC_REVISION_AB_NO_ABORT'")
s=s.replace("executionPass:rows.every(r=>!r.base.timeout&&!r.collective.timeout)","executionPass:rows.every(r=>!r.base.failed&&r.base.output&&!r.collective.failed&&r.collective.output)")
s=s.replace("fs.writeFileSync(path.join(R,'RUN_048_H4_CRITIC_REVISION_AB.json')","fs.writeFileSync(path.join(R,'RUN_049_H4_CRITIC_REVISION_AB_NO_ABORT.json')")
s=s.replace('[RUN_048]','[RUN_049]')
dst.write_text(s,encoding='utf-8')
print(dst)
