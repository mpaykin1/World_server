"""Built-environment and character high-detail voxel recipes."""
from __future__ import annotations

from recipe_core import Recipe, stable_hash
from recipes_nature import _terrain_block, _plant, _rock


def _building(r: Recipe, index: int, x: int, y: int, w: int, d: int, h: int, parent: str, style: int) -> str:
    building = r.feature(f"building:{index:02d}", "building", parent, 2,
                         gameplay={"occupiable": True, "floors": max(1, h // 3)})
    wall = ("wall", "brick", "wall_light")[style % 3]
    r.cuboid(x, x+w-1, y, y+d-1, 1, h, wall, building)
    roof = r.feature(f"building:{index:02d}:roof", "roof", building, 2)
    roof_mat = "roof" if style != 1 else "metal_dark"
    r.cuboid(x-1, x+w, y-1, y+d, h+1, h+1, roof_mat, roof)
    if style == 2 and h >= 6:
        r.cuboid(x, x+w-1, y, y+d-1, h+2, h+2, "metal", roof)
    entrance = r.feature(f"building:{index:02d}:entrance", "entrance", building, 3,
                         gameplay={"walkablePortal": True})
    door_x = x + max(1, w//2)
    r.put(door_x, y-1, 2, "wood_dark", entrance)
    r.put(door_x, y-1, 3, "wood", entrance)
    # Stable facade rhythm: each window is addressable.
    win = 0
    for z in range(3, h, 2):
        for wx in range(x+1, x+w-1, 2):
            f = r.feature(f"building:{index:02d}:window:{win:02d}", "window", building, 3,
                          gameplay={"facade": "front"})
            r.put(wx, y-1, z, "glass" if (win+style)%3 else "glass_dark", f)
            win += 1
        for wy in range(y+1, y+d-1, 2):
            f = r.feature(f"building:{index:02d}:window:{win:02d}", "window", building, 3,
                          gameplay={"facade": "side"})
            r.put(x+w, wy, z, "glass", f)
            win += 1
    if h > 6:
        plant = r.feature(f"building:{index:02d}:roofTech", "roofEquipment", roof, 3)
        r.cuboid(x+w//2, x+w//2+1, y+d//2, y+d//2+1, h+2, h+3, "metal", plant)
    return building


def build_city(seed: int, lod: int = 0, params=None) -> Recipe:
    r = Recipe("city", seed, lod, params)
    root = _terrain_block(r, 13, "grass")
    district = r.feature("district:central", "district", root, 1, gameplay={"settlement": True})
    streets = [
        ("street:northSouth", (-2,2,-13,13)), ("street:eastWest", (-13,13,-2,2)),
        ("street:westLane", (-10,-8,-13,13)), ("street:eastLane", (8,10,-13,13)),
    ]
    for suffix,(xa,xb,ya,yb) in streets:
        f=r.feature(suffix,"street",district,1,gameplay={"transport":True,"walkable":True})
        r.cuboid(xa,xb,ya,yb,1,1,"road",f)
    for suffix,(xa,xb,ya,yb) in [
        ("sidewalk:west",(-7,-6,-13,13)),("sidewalk:east",(5,6,-13,13)),
        ("sidewalk:south",(-13,13,-7,-6)),("sidewalk:north",(-13,13,5,6))]:
        f=r.feature(suffix,"sidewalk",district,2,gameplay={"walkable":True})
        r.cuboid(xa,xb,ya,yb,1,1,"road_lit",f)
    plaza=r.feature("publicSpace:plaza","publicSpace",district,1,gameplay={"gathering":True})
    r.cuboid(-5,5,5,12,1,1,"sand_lit",plaza)
    specs=[
        (-13,-13,5,5,7,0),(-6,-13,4,5,10,2),(5,-13,3,5,6,1),
        (10,-13,4,5,8,0),(-13,-5,5,4,5,1),(7,-5,5,4,11,2),
        (-13,7,5,5,9,2),(7,7,6,5,7,0),(10,1,4,4,5,1),
    ]
    for i,(x,y,w,d,h,style) in enumerate(specs):
        _building(r,i,x,y,w,d,h,district,style)
    alley=r.feature("alley:00","alley",district,2,gameplay={"walkable":True})
    r.cuboid(-6,-3,-6,4,1,1,"dirt_lit",alley)
    infra=r.feature("infrastructure","infrastructure",district,2,gameplay={"utility":True})
    for i,(x,y) in enumerate([(-5,-5),(5,-5),(-5,4),(5,4),(-11,5),(11,5)]):
        lamp=r.feature(f"lamp:{i:02d}","streetLamp",infra,3)
        r.column(x,y,2,5,"metal_dark",lamp)
        r.put(x,y,6,"light",lamp)
    for i,(x,y) in enumerate([(-5,9),(0,10),(5,9),(-10,3),(11,3)]):
        tree=r.feature(f"streetTree:{i:02d}","streetTree",plaza,3,gameplay={"ecology":True})
        r.column(x,y,2,4,"wood",tree)
        r.sphere(x,y,6,2,2,2,"leaves",tree)
    transformer=r.feature("utility:transformer","technicalObject",infra,3,gameplay={"energy":True})
    r.cuboid(4,5,3,4,2,4,"metal_dark",transformer)
    vents=r.feature("utility:vents","technicalObject",infra,3)
    r.cuboid(-2,-1,9,10,2,3,"metal",vents)
    r.meta["design"]="structured miniature city: streets -> blocks -> buildings -> entrances -> public space -> details"
    return r


def build_energy(seed: int, lod: int = 0, params=None) -> Recipe:
    r=Recipe("energy",seed,lod,params)
    root=_terrain_block(r,13,"grass")
    complex_f=r.feature("complex","industrialComplex",root,1,gameplay={"powerGeneration":True})
    road=r.feature("serviceRoad","serviceRoad",complex_f,1,gameplay={"transport":True})
    r.cuboid(-13,13,-3,0,1,1,"road",road)
    hall=r.feature("mainHall","industrialBuilding",complex_f,1,gameplay={"production":True})
    r.cuboid(-8,1,1,8,2,8,"brick",hall)
    roof=r.feature("mainHall:roof","roof",hall,2)
    r.cuboid(-9,2,0,9,9,9,"metal_dark",roof)
    annex=r.feature("annex","industrialBuilding",complex_f,2)
    r.cuboid(-11,-7,-9,-4,2,6,"wall_dark",annex)
    stack=r.feature("stack","chimney",complex_f,1,gameplay={"emissionPoint":True})
    r.column(-6,5,9,20,"brick",stack,1)
    for z in range(10,21,3):
        r.disc(-6,5,z,2,"brick_lit",stack,hole=.8)
    cooling=r.feature("coolingTower","coolingTower",complex_f,1,gameplay={"cooling":True})
    for z in range(2,13):
        radius=4 if z<5 or z>10 else 3
        r.disc(7,6,z,radius,"wall_dark" if z%3==0 else "wall",cooling,hole=max(0,radius-1.3))
    tanks=r.feature("tankFarm","tankFarm",complex_f,2,gameplay={"storage":True})
    for i,(x,y) in enumerate([(6,-8),(10,-8),(10,-3)]):
        tank=r.feature(f"tank:{i:02d}","tank",tanks,2)
        for z in range(2,7):
            r.disc(x,y,z,2,"metal",tank)
        r.disc(x,y,7,1.6,"metal_lit",tank)
    pipes=r.feature("pipeNetwork","pipeNetwork",complex_f,2,gameplay={"connectsEquipment":True})
    pipe_paths=[
        [(-7,3,5),(-3,3,5),(2,3,5),(5,1,5),(6,-6,5)],
        [(-7,5,4),(-10,5,4),(-10,-3,4),(7,-3,4)],
        [(2,7,3),(4,7,3),(7,6,4)],
    ]
    for i,path in enumerate(pipe_paths):
        f=r.feature(f"pipe:{i:02d}","pipe",pipes,2)
        r.path(path,0,"metal_lit",f)
    yard=r.feature("transformerYard","transformerYard",complex_f,1,gameplay={"gridConnection":True})
    r.cuboid(3,13,10,13,1,1,"road_lit",yard)
    for i,x in enumerate(range(4,13,3)):
        tr=r.feature(f"transformer:{i:02d}","transformer",yard,2,gameplay={"energy":True})
        r.cuboid(x,x+1,11,12,2,5,"metal_dark",tr)
        r.put(x,10,5,"light",tr)
    cables=r.feature("cableBus","cableBus",yard,2,gameplay={"energy":True})
    r.path([(3,10,6),(7,10,7),(11,10,6),(13,9,6)],0,"metal",cables)
    for i,(x,y) in enumerate([(-12,2),(-11,8),(2,-9),(12,2),(1,11)]):
        equipment=r.feature(f"equipment:{i:02d}","technicalEquipment",complex_f,3)
        r.cuboid(x,x+1,y,y+1,2,3+(i%2),"metal_dark" if i%2 else "metal",equipment)
    r.meta["design"]="hierarchical power complex with dominant hall, stack, cooling, storage and grid yard"
    return r


def build_idea(seed: int, lod: int = 0, params=None) -> Recipe:
    r=Recipe("idea",seed,lod,params)
    root=_terrain_block(r,10,"stone")
    campus=r.feature("campus","knowledgeCampus",root,1,gameplay={"research":True})
    core=r.feature("knowledgeCore","knowledgeCore",campus,1,
                   gameplay={"ideaSource":True,"information":True})
    r.cuboid(-3,3,-3,3,1,3,"stone_dark",core)
    for z,rad in [(4,3),(5,3),(6,2),(7,2),(8,1),(9,1)]:
        r.disc(0,0,z,rad,"crystal_hot" if z>=7 else "crystal",core)
    modules=[(-8,-5,0),(-8,5,1),(7,-6,2),(7,6,3)]
    for i,(x,y,style) in enumerate(modules):
        m=r.feature(f"module:{i:02d}","researchModule",campus,2,
                    relationships=[{"type":"linkedTo","target":core}],gameplay={"research":True})
        r.cuboid(x,x+4,y,y+4,1,4+(style%2),"wall" if style%2==0 else "metal",m)
        roof=r.feature(f"module:{i:02d}:instrument","researchInstrument",m,3)
        r.column(x+2,y+2,5,7,"metal_lit",roof)
        r.put(x+2,y+2,8,"crystal",roof)
    links=r.feature("informationLinks","informationLinks",campus,1,
                    gameplay={"informationFlow":True})
    for i,(x,y,_) in enumerate(modules):
        f=r.feature(f"link:{i:02d}","informationLink",links,2,
                    relationships=[{"type":"connects","target":core}])
        r.path([(0,0,3),(round(x/2),round(y/2),3),(x+2,y+2,3)],0,"crystal",f)
    ring=r.feature("discussionRing","publicResearchSpace",campus,2,gameplay={"gathering":True})
    r.disc(0,0,1,8,"road_lit",ring,hole=6)
    for i,angle in enumerate(range(0,360,45)):
        import math
        x=round(math.cos(math.radians(angle))*8); y=round(math.sin(math.radians(angle))*8)
        node=r.feature(f"symbolNode:{i:02d}","symbolicNode",ring,3,gameplay={"information":True})
        r.column(x,y,2,4,"metal_dark",node)
        r.put(x,y,5,"crystal_hot",node)
    panels=r.feature("researchPanels","researchPanels",campus,2)
    for i,(x,y) in enumerate([(-4,0),(4,0),(0,-5),(0,5)]):
        f=r.feature(f"panel:{i:02d}","researchPanel",panels,3)
        r.cuboid(x,x+1,y,y,2,4,"glass_dark",f)
        r.put(x, y, 5, "light", f)
    r.meta["design"]="recognizable knowledge campus with central core, modules and explicit information links"
    return r


ROLE_ACCESSORY={"resident":"bag","farmer":"tool","lumberjack":"tool","miner":"helmet","builder":"helmet","researcher":"tablet","fisher":"rod"}


def build_villager(seed: int, lod: int = 0, params=None) -> Recipe:
    params=dict(params or {})
    role=str(params.get("role","resident"))
    height=max(8,min(13,int(params.get("height",10))))
    build=max(1,min(3,int(params.get("build",2))))
    skin=("skin_dark","skin","skin_light")[int(params.get("skin",stable_hash(seed,"skin")%3))%3]
    shirt=("shirt","shirt_alt","brick_lit")[int(params.get("clothing",stable_hash(seed,"shirt")%3))%3]
    hair=("hair_dark","hair")[int(params.get("hair",stable_hash(seed,"hair")%2))%2]
    r=Recipe("villager",seed,lod,{**params,"role":role,"height":height,"build":build})
    root=r.feature("root","human",None,1,gameplay={"resident":True,"role":role})
    shoe_h=1; leg_h=max(3,height//3); torso_h=max(3,height//3); head_h=3
    left_leg=r.feature("leftLeg","leg",root,1,gameplay={"animationSocket":"leftLeg"})
    right_leg=r.feature("rightLeg","leg",root,1,gameplay={"animationSocket":"rightLeg"})
    for leg,x in [(left_leg,-1),(right_leg,1)]:
        r.cuboid(x,x,-1,0,1,shoe_h,"boot",leg)
        r.cuboid(x,x,-1,0,shoe_h+1,leg_h,"pants",leg)
    torso=r.feature("torso","torso",root,1)
    r.cuboid(-build,build,-1,1,leg_h+1,leg_h+torso_h,shirt,torso)
    belt=r.feature("belt","belt",torso,3)
    r.cuboid(-build,build,-2,1,leg_h+1,leg_h+1,"wood_dark",belt)
    neck=r.feature("neck","neck",root,2); r.cuboid(-1,1,0,0,leg_h+torso_h+1,leg_h+torso_h+1,skin,neck)
    shoulders=r.feature("shoulders","shoulders",root,2)
    r.cuboid(-build-1,build+1,-1,1,leg_h+torso_h-1,leg_h+torso_h,shirt,shoulders)
    for side,name in [(-1,"leftArm"),(1,"rightArm")]:
        arm=r.feature(name,"arm",shoulders,1,gameplay={"animationSocket":name})
        x=side*(build+2); r.cuboid(x,x,-1,0,leg_h+2,leg_h+torso_h-1,shirt,arm)
        hand=r.feature(name+":hand","hand",arm,2)
        r.cuboid(x,x,-1,0,leg_h+1,leg_h+1,skin,hand)
    head_z=leg_h+torso_h+2
    head=r.feature("head","head",root,1)
    r.cuboid(-2,2,-1,1,head_z,head_z+head_h,skin,head)
    hair_f=r.feature("hair","hair",head,2)
    r.cuboid(-2,2,-1,1,head_z+head_h+1,head_z+head_h+1,hair,hair_f)
    r.cuboid(-2,2,1,1,head_z+head_h-1,head_z+head_h,hair,hair_f)
    face=r.feature("face","face",head,2)
    for i,x in enumerate((-1,1)):
        eye=r.feature(f"eye:{i:02d}","eye",face,3)
        r.put(x,-2,head_z+head_h-1,"glass_dark",eye)
    nose=r.feature("nose","nose",face,3); r.put(0,-2,head_z+head_h-2,"skin_light",nose)
    mouth=r.feature("mouth","mouth",face,3); r.put(0,-2,head_z+head_h-3,"brick",mouth)
    for i,x in enumerate((-build,build)):
        pocket=r.feature(f"pocket:{i:02d}","pocket",torso,3); r.put(x,-2,leg_h+2,"wood",pocket)
    accessory=ROLE_ACCESSORY.get(role,"bag")
    acc=r.feature("accessory",accessory,root,3,gameplay={"role":role})
    if accessory=="helmet":
        r.cuboid(-2,2,-2,1,head_z+head_h+2,head_z+head_h+2,"metal",acc)
    elif accessory=="tablet":
        r.cuboid(build+2,build+3,-2,-1,leg_h+3,leg_h+5,"glass_dark",acc)
    elif accessory=="rod":
        r.path([(build+2,-1,leg_h+2),(build+4,-1,leg_h+5),(build+5,-1,leg_h+8)],0,"wood_lit",acc)
    elif accessory=="tool":
        r.path([(build+2,-1,leg_h+1),(build+3,-1,leg_h+5)],0,"wood",acc)
        r.put(build+4,-1,leg_h+5,"metal",acc)
    else:
        r.cuboid(build+1,2*build,-1,1,leg_h+2,leg_h+5,"wood_dark",acc)
    r.meta.update({
        "design":"parametric readable voxel human",
        "roles":["resident","farmer","lumberjack","miner","builder","researcher","fisher"],
        "animationSockets":["leftLeg","rightLeg","leftArm","rightArm","head"],
        "preparedClips":["idle","walk","work","carry","sit"],
    })
    return r


BUILDERS={"city":build_city,"energy":build_energy,"idea":build_idea,"villager":build_villager}
