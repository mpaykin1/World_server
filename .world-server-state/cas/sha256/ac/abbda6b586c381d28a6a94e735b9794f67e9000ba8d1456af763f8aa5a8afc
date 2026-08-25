import math

def retarget_motion(motion):
    frames = motion.get("frames", [])
    out=[]
    for f in frames:
        angles=dict(f.get("angles",{}))
        # clamp noisy 2D-derived angles into animation-friendly ranges
        for k,v in list(angles.items()):
            angles[k]=max(-1.45,min(1.45,float(v)))
        out.append({"t":float(f.get("t",0.0)),"angles":angles,"root":list(f.get("root",[0,0,0]))})
    return {"frames":out}

def synthesize_animation_library(source_motion):
    frames=source_motion.get("frames",[])
    duration=float(frames[-1]["t"]) if frames else 1.0
    idle=[]
    walk=[]
    run=[]
    jump=[]
    for i in range(24):
        t=i/24.0
        phase=t*math.tau
        idle.append({"t":t,"angles":{"torso":0.025*math.sin(phase),"head":-0.02*math.sin(phase)}})
        walk.append({"t":t,"phase":float(math.sin(phase))})
        run.append({"t":t,"phase":float(math.sin(phase)),"amp":1.35})
        jump.append({"t":t,"lift":float(max(0.0, math.sin(math.pi*t)))})
    return {
        "source_duration":duration,
        "idle":idle,"walk":walk,"run":run,"jump":jump,
        "status":"ok"
    }
