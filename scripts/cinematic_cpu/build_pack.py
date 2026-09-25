"""CPU-only deterministic industrial + volcano GLB factory for existing AI3D city.
Run Blender 4.2+: blender -b -t 2 --python scripts/cinematic_cpu/build_pack.py
Outputs optimized visual assets, NOT a new engine or claim of reference-level photorealism.
"""
import bpy, math, json, hashlib, random
from pathlib import Path
from array import array
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/ai3d-voxel-city/cinematic-assets"
OUT.mkdir(parents=True, exist_ok=True)
M = {}
manifest = {"schema":1,"generator":"cinematic-cpu-v1","license":"project-generated",
            "device":"CPU_ONLY","status":"CANDIDATE_NOT_VISUALLY_VERIFIED","assets":[],"textures":[]}

def make_texture(name, color, seed, kind="base"):
    n=128
    image=bpy.data.images.new(name,width=n,height=n,alpha=True)
    rng=random.Random(seed)
    heights=[(rng.random()-.5)*.19+
             math.sin(x*.27+seed)*math.cos(y*.31+seed)*.065
             for y in range(n) for x in range(n)]
    pixels=array("f")
    for y in range(n):
        for x in range(n):
            i=y*n+x
            if kind=="normal":
                dx=heights[y*n+(x+1)%n]-heights[y*n+(x-1)%n]
                dy=heights[((y+1)%n)*n+x]-heights[((y-1)%n)*n+x]
                v=Vector((-dx*.65,-dy*.65,1)).normalized()
                pixels.extend(((v.x+1)*.5,(v.y+1)*.5,(v.z+1)*.5,1))
            else:
                v=1+heights[i]
                pixels.extend((min(1,color[0]*v),min(1,color[1]*v),min(1,color[2]*v),1))
    image.pixels.foreach_set(pixels)
    image.filepath_raw=str(OUT/(name+".png"));image.file_format="PNG";image.save()
    if kind=="normal":image.colorspace_settings.name="Non-Color"
    f=Path(image.filepath_raw)
    manifest["textures"].append({"file":f.name,"sha256":hashlib.sha256(f.read_bytes()).hexdigest(),
                                  "bytes":f.stat().st_size})
    return image

def mat(name, rgb, rough=.75, metal=0., emit=0., seed=1):
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    nt=m.node_tree;b=nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value=(*rgb,1)
    b.inputs["Roughness"].default_value=rough;b.inputs["Metallic"].default_value=metal
    if emit:
        b.inputs["Emission Color"].default_value=(*rgb,1)
        b.inputs["Emission Strength"].default_value=emit
    else:
        tex=nt.nodes.new("ShaderNodeTexImage");tex.image=make_texture(name,rgb,seed)
        nt.links.new(tex.outputs["Color"],b.inputs["Base Color"])
        norm=nt.nodes.new("ShaderNodeTexImage")
        norm.image=make_texture(name+"-normal",rgb,seed,"normal")
        converter=nt.nodes.new("ShaderNodeNormalMap")
        converter.inputs["Strength"].default_value=.55
        nt.links.new(norm.outputs["Color"],converter.inputs["Color"])
        nt.links.new(converter.outputs["Normal"],b.inputs["Normal"])
    M[name]=m

def clear():
    bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False)

def finish(o,name,material):
    o.name=name;o.data.materials.append(M[material]);return o

def box(name,xyz,scale,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz)
    o=bpy.context.object;o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,material)

def cyl(name,xyz,rad,depth,material,segments=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=rad,depth=depth,location=xyz)
    return finish(bpy.context.object,name,material)

def pipe(name,a,b,r,material,segments=8):
    a=Vector(a);b=Vector(b);o=cyl(name,(a+b)*.5,r,(b-a).length,material,segments)
    o.rotation_euler=(b-a).to_track_quat("Z","Y").to_euler()
    return o

def cooling_tower(lod):
    sides=[48,24,12][lod];bands=[20,10,5][lod];vs=[];fs=[]
    for j in range(bands+1):
        t=j/bands
        radius=10.5-3.3*math.sin(math.pi*t)+t*1.8
        for k in range(sides):
            a=k*math.tau/sides;vs.append((radius*math.cos(a),radius*math.sin(a),34*t))
    for j in range(bands):
        for k in range(sides):
            i=j*sides+k;neighbor=j*sides+(k+1)%sides
            fs.append((i,neighbor,neighbor+sides,i+sides))
    mesh=bpy.data.meshes.new("HyperboloidCoolingTower");mesh.from_pydata(vs,[],fs);mesh.update()
    o=bpy.data.objects.new("HyperboloidCoolingTower",mesh)
    bpy.context.collection.objects.link(o);mesh.materials.append(M["concrete"])
    uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        j=poly.index//sides;k=poly.index%sides
        for l,p in zip(poly.loop_indices,[(k/sides,j/bands),((k+1)/sides,j/bands),
                                          ((k+1)/sides,(j+1)/bands),(k/sides,(j+1)/bands)]):
            uv.data[l].uv=p
    cyl("TowerFoundation",(0,0,1),12,2,"concrete",sides)
    # True hollow cooling-tower opening: never cover the shell with an opaque disc.
    bpy.ops.mesh.primitive_torus_add(major_segments=sides,minor_segments=8,
        major_radius=12.25,minor_radius=.17,location=(0,0,34.2))
    finish(bpy.context.object,"WarmRim","amber")
    if lod<2:
        for k in range(0,sides,2 if lod==0 else 4):
            a=k*math.tau/sides
            pipe("RimRail",(11.2*math.cos(a),11.2*math.sin(a),35),
                 (11.2*math.cos(a+math.tau/sides),11.2*math.sin(a+math.tau/sides),35),
                 .065,"steel",6)

def batch_materials():
    """Merge only compatible static meshes: a few draw calls instead of hundreds."""
    groups={}
    for obj in list(bpy.context.scene.objects):
        if obj.type=="MESH" and len(obj.data.materials)==1:
            groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    for name,objects in groups.items():
        if len(objects)<2:continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        objects[0].name=f"CinematicBatch_{name}"
    bpy.ops.object.select_all(action="DESELECT")


def hero_industrial_detail():
    """Focal-zone geometry: all procedural and batched, not viewport sprites."""
    # Catch real grazing light on a cooling-tower facade: concrete vertical ribs.
    for k in range(32):
        a=k*math.tau/32
        points=[]
        for j in range(8):
            t=j/7
            r=10.5-3.3*math.sin(math.pi*t)+t*1.8+.11
            points.append((r*math.cos(a),r*math.sin(a),34*t))
        for i in range(7):
            pipe("ConcreteSeam",points[i],points[i+1],.085,"concrete",6)
    # Exterior service catwalk and handrail, readable from mid-distance.
    for i in range(14):
        x=5+i*1.84
        box("ServiceCatwalk",(x,12.8,10.1),(1.75,2.8,.23),"steel")
        if i%2==0:
            pipe("CatwalkPost",(x,14.15,10.2),(x,14.15,11.4),.07,"steel",6)
    pipe("CatwalkGuard",(5,14.15,11.4),(29.5,14.15,11.4),.07,"steel",6)
    for i in range(12):
        x=7+i*2
        # Roof fixtures and maintenance equipment give the silhouette scale.
        box("RoofCabinet",(x,-4.0,12.9),(.7,1.4,1.15),"steel")
    # Pipe flanges and welded collars, low-segment toroidal geometry.
    for i in range(12):
        x=3.5+i*2.05
        bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=4,
            location=(x,9,10),major_radius=.81,minor_radius=.085)
        o=finish(bpy.context.object,"SteamFlange","steel")
        o.rotation_euler[1]=math.pi/2
    # Heat exchanger: parallel bundled tubes and repeated retaining braces.
    for i in range(18):
        z=1.3+(i%6)*.44;y=17+(i//6)*.75
        pipe("HeatExchangerTube",(28,y,z),(34,y,z),.09,"steel",6)
    for i in range(9):
        x=9+i*2.15
        box("WindowLintel",(x,-9.64,8.0),(1.3,.18,.16),"steel")
        box("WindowSill",(x,-9.64,5.85),(1.3,.18,.13),"steel")
    for i in range(6):
        x=7+i*4.25
        cyl("PipeValveStem",(x,6,5.2),.12,.55,"steel",8)
        bpy.ops.mesh.primitive_torus_add(major_segments=10,minor_segments=3,
            major_radius=.47,minor_radius=.055,location=(x,6,5.52))
        finish(bpy.context.object,"PipeValveHandwheel","amber")
    # Upper roof antennas / industrial warning-light poles.
    for i in range(6):
        x=-27+i*2.4
        pipe("Antenna",(x,-2,18.3),(x,-2,22+i%3),.065,"steel",6)
        box("SafetyBeacon",(x,-2,22+i%3),(.26,.26,.29),"amber")


def hero_industrial_detail():
    """Real focal-zone geometry, joined by existing per-material batching."""
    # Thirty-two concrete ribs make the cooling-tower shell read at close range.
    for k in range(32):
        a=k*math.tau/32
        pts=[]
        for j in range(8):
            t=j/7;r=10.5-3.3*math.sin(math.pi*t)+t*1.8+.11
            pts.append((r*math.cos(a),r*math.sin(a),34*t))
        for j in range(7):
            pipe("ConcreteTowerRib",pts[j],pts[j+1],.085,"concrete",6)
    # Structural catwalk with genuine guardrail and maintenance cabinets.
    for i in range(14):
        x=5+i*1.84
        box("ServiceCatwalk",(x,12.8,10.1),(1.75,2.8,.23),"steel")
        if i%2==0:
            pipe("CatwalkGuardPost",(x,14.15,10.2),(x,14.15,11.4),.07,"steel",6)
    pipe("CatwalkGuard",(5,14.15,11.4),(29.5,14.15,11.4),.07,"steel",6)
    for i in range(12):
        x=7+i*2
        box("RoofCabinet",(x,-4,12.9),(.7,1.4,1.15),"steel")
    # Flanges and retaining rings reveal recognizable engineering detail.
    for i in range(12):
        x=3.5+i*2.05
        bpy.ops.mesh.primitive_torus_add(major_segments=12,minor_segments=4,
            location=(x,9,10),major_radius=.81,minor_radius=.085)
        o=finish(bpy.context.object,"SteamFlange","steel")
        o.rotation_euler[1]=math.pi/2
    for i in range(18):
        z=1.3+(i%6)*.44;y=17+(i//6)*.75
        pipe("HeatExchangerTube",(28,y,z),(34,y,z),.09,"steel",6)
    for i in range(9):
        x=9+i*2.15
        box("WindowLintel",(x,-9.64,8),(1.3,.18,.16),"steel")
        box("WindowSill",(x,-9.64,5.85),(1.3,.18,.13),"steel")
    for i in range(6):
        x=7+i*4.25
        cyl("PipeValveStem",(x,6,5.2),.12,.55,"steel",8)
        bpy.ops.mesh.primitive_torus_add(major_segments=10,minor_segments=3,
            major_radius=.47,minor_radius=.055,location=(x,6,5.52))
        finish(bpy.context.object,"PipeValveHandwheel","amber")
        x=-27+i*2.4
        pipe("RoofAntenna",(x,-2,18.3),(x,-2,22+i%3),.065,"steel",6)
        box("AviationBeacon",(x,-2,22+i%3),(.26,.26,.29),"amber")


def plant(lod):
    clear();n=[24,14,8][lod];cooling_tower(lod)
    box("TurbineHall",(18,0,5.8),(25,19,11.6),"concrete")
    box("TurbineHallRoof",(18,0,12.0),(26,20,.5),"steel")
    box("ControlBlock",(-21,-4,9),(16,16,18),"concrete")
    box("ControlRoof",(-21,-4,18.2),(16.8,17,.5),"steel")
    cyl("PressureVessel",(18,21,7),5,14,"steel",n)
    for i in range(3 if lod<2 else 1):
        x=-29+i*13
        cyl("GeothermalStack",(x,17,14),1.15,28,"steel",n)
        cyl("StackAviationSignal",(x,17,28.3),1.35,.55,"amber",n)
    for i in range([24,12,5][lod]):
        x=9+(i%8)*2.7;y=-9.56 if i<8 else 9.56
        box("WarmGlass",(x,y,3.5+(i//8)*3),(.9,.12,2.05),"window")
    for i in range([24,12,5][lod]):
        x=-29.07 if i%2 else -12.93
        box("ControlWindows",(x,-10+(i%4)*3.4,3+(i//4)%4*3.4),(.13,1,1.4),"window")
    for i in range([9,5,2][lod]):
        cyl("RooftopVent",(8+i*2.5,-2,13.0),.65,1.3,"steel",max(6,n//2))
    for i in range([10,5,2][lod]):
        y=-12+i*2.4
        pipe("SteamPipe",(3,y,4),(29,y,4),.34,"steel",max(6,n//2))
        if lod<2:pipe("SupportColumn",(15,y,0),(15,y,4),.14,"steel",6)
    pipe("MainSteamFeed",(-10,9,10),(6,9,10),.88,"steel",n)
    pipe("HotPipe",(25,12,2),(25,23,2),.7,"steel",n)
    if lod==0:
        for i in range(14):
            pipe("SafetyRail",(8+i*1.6,-10.5,12.3),(8+i*1.6,-10.5,13.6),.055,"steel",6)
    if lod==0:hero_industrial_detail()
    batch_materials()
    return stats("geothermal-plant",lod)

def volcano(lod):
    clear();sides=[96,48,18][lod];bands=[18,9,4][lod]
    rng=random.Random(8225);ridges=[rng.uniform(-1,1) for _ in range(sides)]
    vs=[];fs=[]
    for j in range(bands+1):
        t=j/bands;r=65*(1-t)**.68+.8
        for k in range(sides):
            a=k*math.tau/sides
            ridge=(math.sin(a*7+t*16)*2.3+math.sin(a*19-t*13)*1.2+ridges[k]*2)*(1-t*.7)
            vs.append(((r+ridge)*math.cos(a),(r+ridge)*math.sin(a),49*t-7+ridge*.38))
    for j in range(bands):
        for k in range(sides):
            i=j*sides+k;neighbor=j*sides+(k+1)%sides
            fs.append((i,neighbor,neighbor+sides,i+sides))
    mesh=bpy.data.meshes.new("BasaltRidge");mesh.from_pydata(vs,[],fs);mesh.update()
    obj=bpy.data.objects.new("BasaltStratovolcano",mesh)
    bpy.context.collection.objects.link(obj);mesh.materials.append(M["basalt"])
    uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        j=poly.index//sides;k=poly.index%sides
        for li,p in zip(poly.loop_indices,[(k/sides,j/bands),((k+1)/sides,j/bands),
                                          ((k+1)/sides,(j+1)/bands),(k/sides,(j+1)/bands)]):
            uv.data[li].uv=p
    cyl("GlowingCrater",(0,0,42.5),2.5,.5,"lava",max(12,sides//6))
    for stream in range([8,5,2][lod]):
        angle=stream*math.tau/8+.15
        last=None;steps=[16,8,4][lod]
        for j in range(steps):
            t=1-j/steps;r=63*(1-t)**.68+1
            p=(r*math.cos(angle+t*1.5),r*math.sin(angle+t*1.5),49*t-7+1.3)
            if last:pipe("EmissiveLavaFissure",last,p,.18+(1-t)*.2,"lava",6)
            last=p
    batch_materials()
    return stats("volcano",lod)

def stats(kind,lod):
    meshes=[o for o in bpy.context.scene.objects if o.type=="MESH"]
    return {"kind":kind,"lod":lod,"vertices":sum(len(o.data.vertices) for o in meshes),
            "triangles":sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),
            "objects":len(meshes)}

def main():
    bpy.context.scene.render.engine="CYCLES";bpy.context.scene.cycles.device="CPU"
    mat("concrete",(.26,.28,.30),.9,seed=17)
    mat("steel",(.17,.21,.24),.47,metal=.78,seed=18)
    mat("basalt",(.08,.095,.11),.92,seed=19)
    mat("amber",(1,.21,.045),emit=2)
    mat("window",(1,.53,.21),emit=3)
    mat("lava",(1,.12,.017),emit=3)
    for kind,fn in (("geothermal-plant",plant),("volcano",volcano)):
        previous=None
        for lod in range(3):
            data=fn(lod)
            if previous is not None and data["triangles"]>=previous:
                raise ValueError(f"LOD must reduce triangles for {kind}")
            previous=data["triangles"]
            f=OUT/f"{kind}-lod{lod}.glb"
            bpy.ops.export_scene.gltf(filepath=str(f),export_format="GLB",
                export_apply=True,export_yup=True,export_materials="EXPORT",
                export_image_format="AUTO",export_normals=True,export_texcoords=True)
            if f.stat().st_size<1024:raise ValueError(f"Export failed: {f}")
            data.update({"file":f.name,"bytes":f.stat().st_size,
                         "sha256":hashlib.sha256(f.read_bytes()).hexdigest()})
            manifest["assets"].append(data)
            print("GENERATED",json.dumps(data),flush=True)
    (OUT/"cinematic-pack.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    print("CINEMATIC_CPU_PACK_READY",flush=True)

if __name__=="__main__":main()
