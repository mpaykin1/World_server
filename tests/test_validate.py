import json
from video2game_voxel.validate import validate_build

def test_validate_build(tmp_path):
    assets = tmp_path / "public" / "assets"
    assets.mkdir(parents=True)
    (assets / "manifest.json").write_text(json.dumps({"scene":{}, "avatar":{}, "game":{}, "pipeline":{}}), encoding="utf-8")
    (assets / "scene_manifest.json").write_text("{}", encoding="utf-8")
    (assets / "avatar.json").write_text("{}", encoding="utf-8")
    (assets / "collision.json").write_text("{}", encoding="utf-8")
    (assets / "navgrid.json").write_text("{}", encoding="utf-8")
    (tmp_path / "PIPELINE_REPORT.json").write_text("{}", encoding="utf-8")
    res = validate_build(tmp_path, {
        "require_manifest": True,
        "require_scene_manifest": True,
        "require_avatar_meta": True,
        "require_collision": True,
        "require_navgrid": True,
        "require_pipeline_report": True,
    })
    assert res["status"] == "ok"
