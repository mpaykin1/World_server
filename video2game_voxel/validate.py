from pathlib import Path
import json

def validate_build(out_dir, validation_cfg):
    out=Path(out_dir)
    public=out/"public"/"assets"
    checks={
        "manifest":public/"manifest.json",
        "scene_manifest":public/"scene_manifest.json",
        "avatar_meta":public/"avatar.json",
        "collision":public/"collision.json",
        "navgrid":public/"navgrid.json",
        "pipeline_report":out/"PIPELINE_REPORT.json",
    }
    required={
        "manifest":validation_cfg.get("require_manifest",True),
        "scene_manifest":validation_cfg.get("require_scene_manifest",True),
        "avatar_meta":validation_cfg.get("require_avatar_meta",True),
        "collision":validation_cfg.get("require_collision",True),
        "navgrid":validation_cfg.get("require_navgrid",True),
        "pipeline_report":validation_cfg.get("require_pipeline_report",True),
    }
    results={}; errors=[]
    for key,path in checks.items():
        exists=path.exists()
        results[key]={"exists":exists,"path":str(path)}
        if required.get(key,False) and not exists:
            errors.append(f"missing:{key}")
    manifest_ok=False
    if checks["manifest"].exists():
        try:
            data=json.loads(checks["manifest"].read_text(encoding="utf-8"))
            manifest_ok=all(k in data for k in ["scene","avatar","game","pipeline"])
        except Exception:
            manifest_ok=False
    results["manifest_contract_ok"]=manifest_ok
    if required.get("manifest",True) and checks["manifest"].exists() and not manifest_ok:
        errors.append("broken:manifest_contract")
    return {"status":"ok" if not errors else "failed","errors":errors,"checks":results}
