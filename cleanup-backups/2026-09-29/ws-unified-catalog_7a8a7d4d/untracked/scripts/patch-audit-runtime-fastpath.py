from pathlib import Path
p=Path(__file__).resolve().parents[1]/'scripts'/'world-fleet-audit.js'
t=p.read_text(encoding='utf-8')
repls=[
("const p1=playerPos(await runtimePlayer(page)); const wFile=`${base}-w.png`; await shot(page,wFile);\n    result.wasd=runtime?moved(p0,p1):metric(beforeFile,wFile).changed;","const p1=playerPos(await runtimePlayer(page)); const wFile=`${base}-w.png`; if(!runtime) await shot(page,wFile);\n    result.wasd=runtime?moved(p0,p1):metric(beforeFile,wFile).changed;"),
("const p3=playerPos(await runtimePlayer(page)); const aFile=`${base}-arrow.png`; await shot(page,aFile);\n    result.arrows=runtime?moved(p2,p3):metric(wFile,aFile).changed;","const p3=playerPos(await runtimePlayer(page)); const aFile=`${base}-arrow.png`; if(!runtime) await shot(page,aFile);\n    result.arrows=runtime?moved(p2,p3):metric(wFile,aFile).changed;"),
("const p1=playerPos(await runtimePlayer(page)); const after=`${base}-move.png`; await shot(page,after);\n      result.joystick=runtime?moved(p0,p1):metric(beforeFile,after).changed;","const p1=playerPos(await runtimePlayer(page)); const after=`${base}-move.png`; if(!runtime) await shot(page,after);\n      result.joystick=runtime?moved(p0,p1):metric(beforeFile,after).changed;"),
("const p1=await runtimePlayer(page); const after=`${base}-look.png`; await shot(page,after);\n      result.look=runtime?!!(p0&&p1&&(Math.abs((p1.yaw||0)-(p0.yaw||0))+Math.abs((p1.pitch||0)-(p0.pitch||0))>.02)):metric(beforeFile,after).changed;","const p1=await runtimePlayer(page); const after=`${base}-look.png`; if(!runtime) await shot(page,after);\n      result.look=runtime?!!(p0&&p1&&(Math.abs((p1.yaw||0)-(p0.yaw||0))+Math.abs((p1.pitch||0)-(p0.pitch||0))>.02)):metric(beforeFile,after).changed;")]
for old,new in repls:
 if new in t: continue
 if old not in t: raise SystemExit('anchor missing')
 t=t.replace(old,new,1)
p.write_text(t,encoding='utf-8')
print('patched runtime fast-path')