"""Deterministic illustrated event overlays: no image-generation API or per-turn tokens."""
import math

STORY = (
    "story_dragon_fire", "story_dragon_arrival", "story_dragon_help",
    "story_dragon_aftermath", "story_fire", "story_flood", "story_storm",
    "story_earthquake", "story_meteor", "story_epidemic", "story_attack",
    "story_rain", "story_drought", "story_forest", "story_festival",
    "story_trade", "story_rescue", "story_extinguish", "story_evacuation",
    "story_rebuild", "story_defense", "story_recovery", "story_unknown"
)
HEAD = {
    "story_dragon_fire": "ДРАКОН ПОДЖЁГ ГОРОД",
    "story_dragon_arrival": "НАД ГОРОДОМ ДРАКОН",
    "story_dragon_help": "ДРАКОН ПОМОГ ГОРОДУ",
    "story_dragon_aftermath": "СЛЕДЫ ДРАКОНЬЕГО ОГНЯ",
    "story_fire": "ПОЖАР В ГОРОДЕ", "story_flood": "НАВОДНЕНИЕ",
    "story_storm": "ГОРОД НАКРЫЛ УРАГАН",
    "story_earthquake": "ЗЕМЛЕТРЯСЕНИЕ",
    "story_meteor": "ПАДЕНИЕ МЕТЕОРИТА",
    "story_epidemic": "ЭПИДЕМИЯ", "story_attack": "АТАКА НА ГОРОД",
    "story_rain": "ПРИШЛИ ДОЖДИ", "story_drought": "ЗАСУХА",
    "story_forest": "ЗЕЛЁНЫЙ ГОРОД", "story_festival": "ГОРОДСКОЙ ПРАЗДНИК",
    "story_trade": "ТОРГОВЛЯ", "story_rescue": "СПАСАТЕЛЬНАЯ МИССИЯ",
    "story_extinguish": "ОГОНЬ ПОТУШЕН",
    "story_evacuation": "ЭВАКУАЦИЯ", "story_rebuild": "ВОССТАНОВЛЕНИЕ",
    "story_defense": "ОБОРОНА ГОРОДА", "story_recovery": "ГОРОД ОЖИВАЕТ",
    "story_unknown": "НЕОЖИДАННЫЙ ПОВОРОТ"
}


def dragon(d, frame, story):
    """Animated polygonal winged creature with burning-city breath."""
    x = 428 - int(91 * frame)
    y = 116 + int(8 * math.sin(frame * math.tau))
    shade = (49, 98, 87) if story == "dragon_help" else (57, 44, 73)
    d.polygon([(x-30,y+7),(x-104,y-7),(x-127,y-41),(x-113,y+19),
               (x-62,y+30)], fill=(55, 54, 66))
    flap = int(43 * math.sin(frame * math.tau))
    d.polygon([(x-14,y),(x-87,y-71-flap),(x-54,y-43-flap//2),
               (x+14,y-12)], fill=shade, outline=(196, 144, 112), width=3)
    d.ellipse((x-43,y-13,x+42,y+32), fill=shade,
              outline=(180, 137, 108), width=3)
    d.polygon([(x+19,y-7),(x+64,y-25),(x+81,y-11),(x+64,y+3),
               (x+33,y+12)], fill=shade, outline=(181, 139, 106), width=3)
    d.ellipse((x+61,y-15,x+70,y-7), fill=(255, 231, 113))
    d.polygon([(x-33,y+17),(x-22,y+45),(x-11,y+20)], fill=shade)
    d.polygon([(x+13,y+22),(x+22,y+43),(x+31,y+22)], fill=shade)
    if story=="dragon_fire":
        flare=int(9*math.sin(frame*math.tau))
        d.polygon([(x+78,y-2),(x+15,y+83+flare),(275,209+flare),
                   (x+54,y+9)], fill=(253,102,35), outline=(255,205,79))
        d.polygon([(x+65,y+5),(x+18,y+62),(300,202),(x+54,y+11)],
                  fill=(255,223,75))
    if story=="dragon_help":
        for j in range(8):
            gx=x+36+(j*24)%105;gy=y+22+(j*21)%85
            d.ellipse((gx,gy,gx+9,gy+9),
                      fill=(255,218,92),outline=(246,239,183))


def burned_site(d, frame, smolder=True):
    d.polygon([(229,258),(245,191),(294,189),(352,216),(391,260)],
              fill=(65, 58, 60),outline=(116, 110, 107),width=3)
    d.line([(250,211),(278,190),(303,231),(346,207)],
           fill=(210, 174, 151),width=4)
    for j in range(4):
        bx=241+j*36;flare=int(9*math.sin(frame*math.tau+j))
        d.polygon([(bx,242),(bx+12,201+flare),(bx+27,241)],
                  fill=(251, 111, 41) if smolder else (93,96,99))
        if smolder:
            d.polygon([(bx+6,237),(bx+13,213+flare),(bx+19,237)],
                      fill=(255, 217, 77))
        drift=frame*28+j*4
        d.ellipse((bx+6+drift,160-j*11,bx+27+drift,187-j*11),
                  fill=(86, 91, 101))


def draw_story(d, scene, variant, frame, plant):
    kind=scene.removeprefix("story_")
    if kind in ("dragon_fire","dragon_aftermath","fire","meteor","attack"):
        burned_site(d,frame,smolder=kind!="dragon_aftermath")
    if kind.startswith("dragon") and kind!="dragon_aftermath":
        dragon(d,frame,kind)
    if kind=="flood":
        d.polygon([(0,220),(122,213),(262,232),(389,218),(640,222),
                   (640,321),(0,321)],fill=(38,128,165))
        for j in range(9):
            x=30+j*81;wave=int(5*math.sin(frame*math.tau+j))
            d.arc((x,244+wave,x+58,263+wave),185,345,
                  fill=(207,242,231),width=3)
    if kind in ("storm","rain"):
        for j in range(23 if kind=="storm" else 14):
            x=(j*43+variant*24)%640; y=76+(j*31)%156
            drift=int(frame*21)
            d.line((x+drift,y,x+drift-11,y+27),
                   fill=(178,224,236),width=3)
        if kind=="storm":
            d.line((372,80,346,128,373,142,333,196),
                   fill=(255,244,151),width=7)
    if kind=="earthquake":
        d.line([(170,291),(240,263),(311,296),(390,252),(467,276)],
               fill=(35,28,38),width=9)
    if kind=="meteor":
        x=498-int(frame*178);y=53+int(frame*120)
        d.polygon([(x+80,y-59),(x+9,y-14),(x+26,y+8),(x+89,y-41)],
                  fill=(249,156,62))
        d.ellipse((x-5,y-6,x+32,y+31),fill=(246,115,44),
                  outline=(255,226,141),width=6)
    if kind in ("epidemic","rescue","evacuation"):
        d.rounded_rectangle((228,161,384,262),radius=10,
                            fill=(233,236,225),outline=(77,146,153),width=3)
        d.rectangle((283,171,328,248),fill=(193,74,81))
        d.rectangle((267,188,346,224),fill=(193,74,81))
        if kind=="evacuation":
            offset=int(frame*62)
            d.polygon([(146+offset,275),(206+offset,269),
                       (239+offset,282),(180+offset,294)],
                      fill=(241,201,102))
    if kind in ("forest","recovery","rain"):
        for j in range(10):
            x=158+j*37
            plant(d,x,290,1.06,wave=int(3*math.sin(j+frame*math.tau)))
    if kind=="drought":
        d.line([(121,267),(197,252),(244,294),(289,272),(348,305)],
               fill=(126,89,62),width=7)
    if kind in ("festival","trade","dragon_help","rebuild","defense","extinguish"):
        color=(233,188,75) if kind!="extinguish" else (82,171,204)
        for j in range(11):
            x=154+j*40;y=175+int(15*math.sin(frame*math.tau+j))
            d.ellipse((x,y,x+11,y+11),fill=color)
