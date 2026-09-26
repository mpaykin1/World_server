#!/usr/bin/env python3
"""Offline, deterministic isometric Telegram scenes; no runtime AI or paid assets.
Run: py -3 tools/generate-telegram-scenes.py
Requires Pillow and imageio-ffmpeg. Creates PNGs and short muted H264 MP4 loops.
"""
from __future__ import annotations
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import hashlib, json, math, random
import imageio_ffmpeg
from telegram_story_render import STORY, HEAD as STORY_HEAD, draw_story

ROOT = Path(__file__).resolve().parents[1] / "apps/telegram-scenes/media"
ROOT.mkdir(parents=True, exist_ok=True)
W, H = 640, 360
CATS = ("solar", "coal", "geothermal", "water", "food", "workshop", "city")
GENERIC = ("origin", "planning", "blocked", "refresh", "day", "accident",
           "recovery", "growth", "crisis_power", "crisis_water", "crisis_food")
SCENES = GENERIC + tuple(
    stage + "_" + cat for cat in CATS for stage in ("start", "progress", "done")
) + STORY
ANIMATED = {"origin", "accident", "recovery", "crisis_power", "crisis_water",
            "crisis_food"} | {"start_" + c for c in CATS} | {"done_" + c for c in CATS} | set(STORY)
NAMES = {"solar": "СОЛНЕЧНАЯ ЭНЕРГИЯ", "coal": "УГОЛЬНАЯ СТАНЦИЯ",
         "geothermal": "ГЕОТЕРМАЛЬНАЯ ЭНЕРГИЯ", "water": "ВОДНАЯ ИНФРАСТРУКТУРА",
         "food": "ФЕРМЕРСКОЕ ХОЗЯЙСТВО", "workshop": "ПРОМЫШЛЕННОСТЬ",
         "city": "НОВЫЕ ГОРОДСКИЕ ОБЪЕКТЫ"}
HEAD = {"origin": "НОВЫЙ МИР", "planning": "ТВОЙ ПРОЕКТ",
        "blocked": "НЕДОСТАТОЧНО РЕСУРСОВ", "refresh": "ТВОЙ ЖИВОЙ МИР",
        "day": "ЕЩЁ ОДИН ДЕНЬ", "accident": "АВАРИЯ", "recovery": "ВОССТАНОВЛЕНИЕ",
        "growth": "ГОРОД РАСТЁТ", "crisis_power": "ЭНЕРГЕТИЧЕСКИЙ КРИЗИС",
        "crisis_water": "НЕХВАТКА ВОДЫ", "crisis_food": "ПРОДОВОЛЬСТВЕННЫЙ КРИЗИС"}
HEAD.update(STORY_HEAD)
STAGES = {"start": "НАЧАЛО СТРОИТЕЛЬСТВА", "progress": "СТРОИТЕЛЬСТВО ИДЁТ",
          "done": "ОБЪЕКТ ЗАРАБОТАЛ"}
FONT = Path("C:/Windows/Fonts/seguisb.ttf")
SMALL = ImageFont.truetype(str(FONT), 16) if FONT.exists() else ImageFont.load_default()
LARGE = ImageFont.truetype(str(FONT), 25) if FONT.exists() else ImageFont.load_default()


def blend(left, right, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(left, right))


def prism(d, x, y, w, depth, height, color):
    x, y, w, depth, height = (int(v) for v in (x, y, w, depth, height))
    h = max(4, height)
    roof = [(x, y-h), (x+w, y-h+depth//3),
            (x+w-depth//2, y-h+depth), (x-depth//2, y-h+2*depth//3)]
    left = [(x-depth//2, y-h+2*depth//3), (x+w-depth//2, y-h+depth),
            (x+w-depth//2, y+depth), (x-depth//2, y+2*depth//3)]
    right = [(x+w, y-h+depth//3), (x+w-depth//2, y-h+depth),
             (x+w-depth//2, y+depth), (x+w, y+depth//3)]
    d.polygon(left, fill=blend(color, (17, 25, 36), .36))
    d.polygon(right, fill=blend(color, (16, 23, 33), .55))
    d.polygon(roof, fill=blend(color, (245, 245, 222), .22), outline=(204, 221, 214))
    for dx in range(12, w-8, 21):
        for dy in range(9, max(10, h), 17):
            tint = (247, 218, 122) if (x+dx+dy) % 3 else (86, 169, 185)
            d.rectangle((x+dx, y-h+dy, x+dx+6, y-h+dy+8), fill=tint)


def plant(d, x, y, scale=1, dry=False, wave=0):
    stalk = (111, 102, 66) if dry else (47, 108, 75)
    canopy = (149, 125, 69) if dry else (43, 150, 112)
    d.line((x, y, x+wave, y-18*scale), fill=stalk, width=max(2, int(scale*3)))
    d.ellipse((x-10*scale+wave, y-31*scale, x+10*scale+wave, y-11*scale),
              fill=canopy, outline=blend(canopy, (210, 241, 196), .3))


def city_background(d, seed, variant, smoke=False):
    rng = random.Random(seed)
    night = variant == 2
    buildings = [(160, 204), (205, 206), (247, 201), (408, 194), (459, 202), (506, 212)]
    colors = [(83, 143, 159), (141, 178, 180), (108, 136, 166),
              (123, 176, 156), (110, 153, 157), (119, 148, 162)]
    for (x, y), col in zip(buildings, colors):
        prism(d, x, y+rng.randrange(-8, 9), rng.randrange(30, 58),
              22, rng.randrange(34, 78), col)
    d.polygon([(0, 274), (640, 274), (640, 313), (0, 303)], fill=(45, 67, 77))
    d.line([(0, 283), (640, 290)], fill=(242, 205, 138), width=2)
    for k in range(15):
        x = rng.randrange(12, 634)
        plant(d, x, rng.randrange(239, 278), rng.choice((.7, 1, 1.2)),
              dry=smoke, wave=rng.randrange(-2, 3))


def scene_frame(scene, variant, fraction):
    rng = random.Random(int.from_bytes(hashlib.sha256(f"{scene}:{variant}".encode()).digest()[:8], "big"))
    danger = scene.startswith("crisis_") or scene in ("blocked", "accident") or (
        scene.startswith("story_") and scene not in
        ("story_dragon_help","story_rain","story_forest","story_festival",
         "story_trade","story_rebuild","story_rescue","story_recovery"))
    night = variant == 2
    sky1 = (29, 50, 79) if night else ((45, 53, 77) if danger else (55, 112, 154))
    sky2 = (90, 75, 87) if danger else ((106, 128, 152) if night else (187, 209, 199))
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(185):
        d.line((0, y, W, y), fill=blend(sky1, sky2, y/185))
    sunx = 490 + variant*32 + math.sin(fraction*math.tau)*12
    d.ellipse((sunx-24, 40, sunx+24, 88),
              fill=(255, 186, 115) if danger else (255, 222, 159))
    for j in range(8):
        x = rng.randrange(-60, 660)
        y = rng.randrange(48, 126)
        radius = rng.randrange(20, 64)
        d.ellipse((x, y, x+radius*2, y+18), fill=blend(sky1, (235, 240, 221), .35))
    d.polygon([(0, 190), (92, 74), (167, 186), (233, 100), (333, 190),
               (410, 125), (525, 188), (592, 115), (640, 182)],
              fill=(84, 104, 123) if danger else (99, 137, 149))
    d.polygon([(0, 198), (95, 95), (146, 190), (239, 118),
               (319, 194), (431, 137), (532, 205), (640, 135), (640, 248), (0, 246)],
              fill=(61, 86, 106) if danger else (74, 115, 128))
    d.polygon([(0, 209), (220, 173), (430, 170), (640, 215), (640, H), (0, H)],
              fill=(78, 105, 93) if danger else (76, 134, 107))
    # A winding river responds visually to drought/cleanup.
    dry = scene=="crisis_water"
    d.polygon([(420, 194), (466, 205), (532, 247), (640, 260), (640, 290),
               (530, 269), (473, 220), (427, 210)],
              fill=(142, 130, 87) if dry else (50, 139, 165))
    d.line([(434, 210), (483, 226), (535, 256), (632, 273)],
           fill=(206, 235, 225) if not dry else (176, 147, 104), width=3)
    city_background(d, rng.randrange(100000), variant,
                    smoke=scene in ("accident","crisis_food") or danger)
    d.polygon([(106, 245), (289, 174), (521, 241), (339, 323)],
              fill=(59, 103, 102), outline=(152, 191, 176), width=3)
    # The main object occupies the same plot across all scenes.
    bits=scene.split("_")
    stage=bits[0] if bits[0] in STAGES else "done"
    category=bits[1] if bits[0] in STAGES else (
        {"crisis_power":"coal","crisis_water":"water","crisis_food":"food",
         "planning":"city","origin":"city","accident":"coal"}.get(scene,"city"))
    building_height = (int(12+17*fraction) if stage=="start"
                       else (39 if stage=="progress" else 68))
    if category == "solar":
        for row in range(3):
            for col in range(4):
                x=221+col*45+row*18; y=228+row*21
                d.polygon([(x,y),(x+34,y-3),(x+44,y+11),(x+9,y+13)],
                          fill=(20, 56, 106), outline=(107, 198, 227), width=2)
                d.line((x+11,y-1,x+20,y+11),fill=(175,235,229),width=1)
        if stage=="done":
            d.ellipse((325+60*fraction,214,336+60*fraction,225),fill=(255,238,174))
    elif category in ("coal","geothermal","workshop"):
        prism(d, 249, 251, 131, 36, building_height, {
            "coal":(132, 128, 126),"geothermal":(107, 191, 172),"workshop":(155, 177, 187)
        }[category])
        for j in range(2 if category=="coal" else 1):
            x=327+j*40
            d.rectangle((x, 246-building_height-35, x+16, 238-building_height),
                        fill=(111, 129, 127))
            if scene=="accident" or (category=="coal" and stage=="done"):
                for q in range(3):
                    drift=int(15*fraction+q*10)
                    d.ellipse((x-9+drift, 170-building_height-q*19,
                               x+19+drift,188-building_height-q*19),
                              fill=(84, 88, 91))
        if category=="geothermal":
            d.arc((355,230,432,310),200,352,fill=(231, 211, 158),width=9)
    elif category=="water":
        d.ellipse((245,199,393,267),fill=(37,101,140),outline=(207,224,208),width=5)
        d.ellipse((256,202,383,252),fill=(52,151,182),outline=(132,227,226),width=3)
        d.arc((267,184,379,247),180,360,fill=(197,219,208),width=9)
        for k in range(4):
            x=275+k*32
            d.line((x,220,x+11+math.sin(fraction*math.tau)*7,227),
                   fill=(216,247,241),width=2)
    elif category=="food":
        for row in range(6):
            y=190+row*17
            d.polygon([(216,y),(391,y+5),(423,y+14),(229,y+10)],
                      fill=(85,131,60),outline=(177,180,102))
            for n in range(8):
                x=229+n*22+row*3
                plant(d,x,y+3,.48,
                      dry=scene=="crisis_food",wave=int(math.sin(fraction*math.tau+n)*2))
    else:
        prism(d, 251, 250, 123, 47, building_height,
              (113, 162, 183) if category=="city" else (169, 177, 160))
        prism(d, 365, 257, 50, 21, max(12,building_height//2), (194, 162, 122))
    if stage in ("start","progress"):
        x=192; y=210
        d.line((x,y+47,x,y-48),fill=(226,188,98),width=6)
        d.line((x-7,y-48,x+152,y-48),fill=(246,211,111),width=6)
        d.line((x+96,y-48,x+91+math.sin(fraction*math.tau)*16,y+4),
               fill=(234,225,179),width=2)
        d.rectangle((x+88,y+4,x+100,y+13),fill=(227,179,93))
    if scene in ("accident","crisis_power","crisis_water","crisis_food"):
        alpha=int(70+30*math.sin(fraction*math.tau))
        d.ellipse((479-alpha//3,110-alpha//3,479+alpha//3,110+alpha//3),
                  outline=(255,111,89),width=5)
        d.polygon([(479,81),(463,121),(495,121)],fill=(245,104,84))
    if scene=="recovery":
        for k in range(8):
            x=210+k*36
            plant(d,x,296,1.2,dry=False,wave=int(fraction*4))
    if scene in ("origin","growth","day","refresh"):
        car=65+int(fraction*210)
        d.polygon([(car,285),(car+19,282),(car+35,291),(car+11,295)],
                  fill=(237,190,102),outline=(252,226,185))
    if scene.startswith("story_"):
        draw_story(d,scene,variant,fraction,plant)
    # Rich, high-contrast title strips readable at Telegram mobile widths.
    d.rounded_rectangle((15,12,437,64),radius=12,fill=(19,39,52),outline=(92,155,164),width=2)
    if "_" in scene and scene.split("_")[0] in STAGES:
        stage,cat=scene.split("_",1)
        heading=STAGES[stage];subtitle=NAMES[cat]
    else:
        heading=HEAD[scene];subtitle="ЦЕПНАЯ РЕАКЦИЯ · ЗЛОЙ ДЖИНН"
    d.text((29,14),heading,font=LARGE,fill=(255,238,199))
    d.text((29,43),subtitle,font=SMALL,fill=(177,222,219))
    d.rounded_rectangle((514,13,625,36),radius=7,fill=(25,43,55))
    d.text((527,16),f"МИР • {variant+1:02d}",font=SMALL,fill=(227,241,229))
    return im


def main():
    entries=[]
    exe=imageio_ffmpeg.get_ffmpeg_exe()
    for i,scene in enumerate(SCENES):
        for variant in range(3):
            prefix=f"{scene}-{variant}"
            png=ROOT/(prefix+".png")
            if not png.exists():
                scene_frame(scene,variant,.63).save(png,format="PNG",optimize=True)
            item={"id":scene,"variant":variant,"photo":png.name}
            if scene in ANIMATED:
                mp4=ROOT/(prefix+".mp4")
                if not mp4.exists():
                    writer=imageio_ffmpeg.write_frames(str(mp4),(W,H),fps=9,codec="libx264",
                        quality=5,pix_fmt_in="rgb24",output_params=[
                        "-pix_fmt","yuv420p","-movflags","+faststart","-preset","veryfast","-crf","31"])
                    writer.send(None)
                    for f in range(18):
                        writer.send(scene_frame(scene,variant,f/17).tobytes())
                    writer.close()
                item["animation"]=mp4.name
            entries.append(item)
        print(f"{i+1}/{len(SCENES)} {scene}",flush=True)
    manifest={"schema":1,"generator":"Pillow and imageio-ffmpeg; deterministic, offline",
              "scenes":entries}
    (ROOT.parent/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),
                                               encoding="utf-8")
    print(f"READY: {len(entries)} unique PNGs, "
          f"{sum('animation' in x for x in entries)} unique MP4s",flush=True)

if __name__=="__main__":
    main()
