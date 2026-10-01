from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math, random
out=Path(r"C:\Users\user\Desktop\ws-flooded-mvp\apps\flooded-cathedral-mvp\assets\fire.apng")
frames=[]
for k in range(10):
    random.seed(410+k)
    im=Image.new("RGBA",(96,96),(0,0,0,0))
    glow=Image.new("RGBA",im.size,(0,0,0,0)); g=ImageDraw.Draw(glow)
    g.ellipse((14,18,82,94),fill=(255,88,12,85))
    glow=glow.filter(ImageFilter.GaussianBlur(12)); im.alpha_composite(glow)
    d=ImageDraw.Draw(im)
    sway=math.sin(k/10*math.tau)*6
    d.polygon([(48+sway,6),(70,42),(62,79),(48,92),(28,78),(23,49)],fill=(255,91,17,235))
    d.polygon([(48-sway*.25,28),(61,53),(55,82),(45,88),(35,70),(37,49)],fill=(255,190,45,245))
    d.polygon([(47+sway*.2,48),(54,65),(49,82),(42,72)],fill=(255,242,165,250))
    for i in range(6):
        x=20+random.random()*56; y=25+random.random()*55
        d.ellipse((x,y,x+3,y+3),fill=(255,150+random.randrange(100),40,180))
    frames.append(im)
frames[0].save(out,save_all=True,append_images=frames[1:],duration=90,loop=0,disposal=2,blend=1,format="PNG")
print(out, out.stat().st_size)
