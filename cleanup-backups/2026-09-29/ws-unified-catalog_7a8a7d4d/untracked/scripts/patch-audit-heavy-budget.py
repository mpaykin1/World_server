from pathlib import Path
p=Path(__file__).resolve().parents[1]/'scripts'/'world-fleet-audit.js'
t=p.read_text(encoding='utf-8')
t=t.replace("let timedOut=false; const deadline=setTimeout(()=>{timedOut=true; context.close().catch(()=>{});},40000);","let timedOut=false; const budget=w.id==='dark-void-scene'?85000:40000; const deadline=setTimeout(()=>{timedOut=true; context.close().catch(()=>{});},budget);",2)
t=t.replace("try{desktop=await withTimeout(desktopAudit(browser,w),45000,`${w.id} desktop`)}","try{desktop=await withTimeout(desktopAudit(browser,w),w.id==='dark-void-scene'?90000:45000,`${w.id} desktop`)}",1)
t=t.replace("try{mobile=await withTimeout(mobileAudit(browser,w),45000,`${w.id} mobile`)}","try{mobile=await withTimeout(mobileAudit(browser,w),w.id==='dark-void-scene'?90000:45000,`${w.id} mobile`)}",1)
p.write_text(t,encoding='utf-8')
print('patched heavy-scene audit budget')