from video2game_voxel.regression import evaluate_regression

def test_regression_pass():
    r=evaluate_regression({"performance":{"desktop_readiness":90,"mobile_readiness":80}},
                          {"status":"ok"},{"status":"green"},
                          {"require_green_gate":True,"min_desktop_readiness":75,"min_mobile_readiness":65})
    assert r["status"]=="pass"
