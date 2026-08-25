from video2game_voxel.motion import retarget_motion, synthesize_animation_library

def test_motion_pipeline():
    m={"frames":[{"t":0.0,"angles":{"torso":5.0},"root":[0,0,0]},{"t":1.0,"angles":{"torso":0.2},"root":[1,0,0]}]}
    r=retarget_motion(m)
    assert abs(r["frames"][0]["angles"]["torso"])<=1.45
    lib=synthesize_animation_library(r)
    assert len(lib["walk"])==24 and lib["status"]=="ok"
