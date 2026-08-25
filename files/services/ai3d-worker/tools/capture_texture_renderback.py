from __future__ import annotations
import argparse, json, shlex, subprocess, sys, time
from pathlib import Path


def run(cmd, timeout):
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout, check=False)
    return p.returncode, p.stdout[-8000:]


def web_capture(url: str, output: Path, width: int, height: int, wait_ms: int, timeout: int):
    script = r'''const { chromium } = require('playwright');
(async()=>{const [url,out,w,h,wait]=process.argv.slice(2); const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:+w,height:+h}}); await p.goto(url,{waitUntil:'networkidle',timeout:30000}); await p.waitForTimeout(+wait); await p.screenshot({path:out,fullPage:false}); await b.close();})().catch(e=>{console.error(e);process.exit(2)});'''
    js = output.with_suffix('.capture.js'); js.write_text(script, encoding='utf-8')
    try: return run(['node', str(js), url, str(output), str(width), str(height), str(wait_ms)], timeout)
    finally: js.unlink(missing_ok=True)


def main():
    p=argparse.ArgumentParser(); p.add_argument('--platform',choices=['web','godot','roblox'],required=True); p.add_argument('--output',required=True)
    p.add_argument('--url'); p.add_argument('--command'); p.add_argument('--width',type=int,default=1280); p.add_argument('--height',type=int,default=720); p.add_argument('--wait-ms',type=int,default=1500); p.add_argument('--timeout',type=int,default=60); p.add_argument('--report')
    a=p.parse_args(); out=Path(a.output).resolve(); out.parent.mkdir(parents=True,exist_ok=True)
    started=time.time(); rc=99; log=''
    if a.platform=='web' and a.url:
        rc,log=web_capture(a.url,out,a.width,a.height,a.wait_ms,a.timeout)
    elif a.command:
        cmd=[part.replace('{output}',str(out)) for part in shlex.split(a.command, posix=sys.platform!='win32')]
        rc,log=run(cmd,a.timeout)
    else:
        log='No automatic capture route configured. Web needs --url; Godot/Roblox need --command.'
    ok=rc==0 and out.is_file() and out.stat().st_size>0
    report={'ok':ok,'platform':a.platform,'output':str(out),'returnCode':rc,'elapsedSeconds':round(time.time()-started,3),'log':log,'runtimeCaptureVerified':ok}
    rp=Path(a.report).resolve() if a.report else out.with_suffix('.capture-report.json'); rp.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2)); raise SystemExit(0 if ok else 2)
if __name__=='__main__': main()
