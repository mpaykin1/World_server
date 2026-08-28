from __future__ import annotations
import argparse,json,os,re,shutil,subprocess,sys
from pathlib import Path
SERVICE_ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(SERVICE_ROOT))
from ai3d.production_v12 import compatibility_matrix_gate_v12

def probe(engine:str,exe:str|None,project:Path|None=None)->dict:
    if not exe:return {"engine":engine,"available":False,"version":"","smokePassed":False,"reason":"executable_not_found"}
    try:
        if engine=="blender": cmd=[exe,"--background","--factory-startup","--python-expr","import bpy; print('V12_VERSION='+bpy.app.version_string)"]
        elif project: cmd=[exe,"--headless","--path",str(project),"--editor","--quit"]
        else: cmd=[exe,"--headless","--version"]
        p=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,check=False,timeout=180)
        text=p.stdout
        m=re.search(r"V12_VERSION=([^\r\n]+)",text) if engine=="blender" else re.search(r"(\d+\.\d+(?:\.\d+)?)",text)
        return {"engine":engine,"available":True,"executable":exe,"version":m.group(1).strip() if m else "unknown","smokePassed":p.returncode==0,"returnCode":p.returncode,"logTail":text[-3000:]}
    except Exception as exc:return {"engine":engine,"available":True,"executable":exe,"version":"unknown","smokePassed":False,"error":str(exc)}

def main():
    ap=argparse.ArgumentParser();ap.add_argument("--blender");ap.add_argument("--godot");ap.add_argument("--godot-project",type=Path);ap.add_argument("--output",type=Path,default=SERVICE_ROOT/"runtime/quality/compatibility-matrix-v12.json");args=ap.parse_args()
    blender=args.blender or os.environ.get("BLENDER_BIN") or shutil.which("blender")
    godot=args.godot or os.environ.get("GODOT_BIN") or shutil.which("godot4") or shutil.which("godot")
    rows=[probe("blender",blender),probe("godot",godot,args.godot_project)]
    gate=compatibility_matrix_gate_v12(rows,{"requiredEngines":["blender","godot"],"requireSmoke":True})
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(gate,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");print(json.dumps(gate,ensure_ascii=False,indent=2));raise SystemExit(0 if gate["passed"] else 1)
if __name__=="__main__":main()
