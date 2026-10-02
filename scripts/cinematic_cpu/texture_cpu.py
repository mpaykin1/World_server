"""Deterministic CPU-only art-directed industrial PBR textures.
Stand-alone math is unit-testable without Blender or a GPU.
All outputs are original project-generated material maps, not copied source art.
"""
import math

def clamp(x,a=0.0,b=1.0):
    return max(a,min(b,x))

def mix(a,b,t):
    return a+(b-a)*t

def hash2(x,y,seed):
    n=(x*374761393+y*668265263+seed*2246822519)&0xffffffff
    n=((n^(n>>13))*1274126177)&0xffffffff
    return ((n^(n>>16))&0xffffffff)/4294967295

def value_noise(x,y,seed):
    ix=math.floor(x);iy=math.floor(y)
    u=x-ix;v=y-iy
    u=u*u*(3-2*u);v=v*v*(3-2*v)
    return mix(mix(hash2(ix,iy,seed),hash2(ix+1,iy,seed),u),
               mix(hash2(ix,iy+1,seed),hash2(ix+1,iy+1,seed),u),v)

def fbm(u,v,seed,octaves=3):
    total=0.;weight=0.;amplitude=.54
    for step in range(octaves):
        total+=value_noise(u,v,seed+step*19)*amplitude
        weight+=amplitude;amplitude*=.49;u*=2.11;v*=2.11
    return total/max(weight,.0001)

def field(kind,u,v,seed):
    # Use non-periodic warp so no obvious stretched checkerboard/tile artifacts.
    warp=fbm(u*7.1,v*9.4,seed,3)
    grain=fbm(u*89,v*91,seed+11,2)
    low=fbm(u*8,v*11,seed+3,3)
    if kind=="concrete":
        streak=clamp((math.sin(u*91+warp*9)+.66)*.44,0,1)**8
        crack=clamp(1-abs(math.sin(u*38+v*13+warp*18))/.095,0,1)
        water=clamp((low-.52)*1.7+streak*.55,0,1)*(.35+.65*v)
        gravel=clamp((grain-.5)*.35,0,1)
        brightness=clamp(.78+(grain-.5)*.29+(low-.5)*.22-water*.24-crack*.39, .24,1.1)
        bump=clamp(.49+(grain-.5)*.45+streak*.15+crack*.34)
        rough=.8+(grain-.5)*.21
        return brightness,bump,clamp(rough),0.
    if kind=="steel":
        oxidation=clamp((low-.46)*2.7+grain*.19,0,1)**2
        scratches=clamp(1-abs(math.sin(v*176+warp*3.9))/.11,0,1)*.22
        welded=clamp(1-abs(math.sin(u*32+warp*12))/.13,0,1)*.20
        brightness=clamp(.85+(grain-.5)*.26-oxidation*.47-scratches*.21, .2,1.0)
        bump=clamp(.48+(grain-.5)*.23+oxidation*.29+welded*.24)
        rough=clamp(.38+oxidation*.36+grain*.13,.31,.9)
        return brightness,bump,rough,oxidation
    if kind=="basalt":
        seam=clamp(1-abs(math.sin(u*43+v*11+warp*24))/.1,0,1)
        strata=math.sin(v*154+warp*14)*.12
        brightness=clamp(.64+(low-.5)*.53+(grain-.5)*.36+strata-seam*.43,.16,.94)
        bump=clamp(.42+(grain-.5)*.53+seam*.43+strata*.33)
        rough=clamp(.77+grain*.16,.6,.96)
        return brightness,bump,rough,0.
    raise ValueError("unknown texture kind "+str(kind))

def sample(kind,u,v,seed,base_rgb):
    bright,height,rough,rust=field(kind,u,v,seed)
    if kind=="steel":
        rust_rgb=(.35,.115,.058)
        rgb=tuple(clamp(base_rgb[i]*bright*(1-rust*.82)+rust_rgb[i]*rust*.82)
                  for i in range(3))
    else:
        rgb=tuple(clamp(component*bright) for component in base_rgb)
    return rgb,height,rough

def bake_material(kind,base_rgb,seed,base_size=384,normal_size=256):
    """Generate 2 baked PNG maps in bpy; do not store giant pixels in glTF vertex data."""
    import bpy
    from array import array
    def height_at(x,y):
        return field(kind,((x+.5)%normal_size)/normal_size,
                     ((y+.5)%normal_size)/normal_size,seed)[1]
    outputs={}
    for channel,size in (("base",base_size),("normal",normal_size),("orm",normal_size)):
        pixels=array("f")
        cache=[]
        if channel=="normal":
            cache=[[height_at(x,y) for x in range(size)] for y in range(size)]
        for y in range(size):
            v=(y+.5)/size
            for x in range(size):
                u=(x+.5)/size
                if channel=="base":
                    rgb,_,_=sample(kind,u,v,seed,base_rgb)
                    pixels.extend((*rgb,1.))
                elif channel=="orm":
                    _,height,rough,rust=field(kind,u,v,seed)
                    ao=clamp(.72+height*.28)
                    metallic=clamp((.82*(1-rust)) if kind=="steel" else 0.)
                    pixels.extend((ao,rough,metallic,1.))
                else:
                    left=cache[y][(x-1)%size];right=cache[y][(x+1)%size]
                    down=cache[(y-1)%size][x];up=cache[(y+1)%size][x]
                    nx=(left-right)*2.4;ny=(down-up)*2.4
                    norm=(nx*nx+ny*ny+1)**-.5
                    pixels.extend(((nx*norm+1)*.5,(ny*norm+1)*.5,(norm+1)*.5,1.))
        image=bpy.data.images.new(kind+"-"+channel,width=size,height=size,alpha=True)
        image.pixels.foreach_set(pixels)
        if channel in ("normal","orm"):image.colorspace_settings.name="Non-Color"
        outputs[channel]=image
    return outputs
