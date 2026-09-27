"""Extract and soften the approved Scratch backdrop for portrait Telegram gutters."""
from pathlib import Path
from PIL import Image,ImageOps,ImageFilter,ImageEnhance
import zipfile,json,io,sys
source=Path(sys.argv[1])
target=Path(__file__).resolve().parents[1]/'apps/telegram-miniapp/backdrop.webp'
with zipfile.ZipFile(source) as archive:
    project=json.loads(archive.read('project.json'))
    stage=next(t for t in project['targets'] if t['isStage'])
    costume=stage['costumes'][0]['md5ext']
    base=Image.open(io.BytesIO(archive.read(costume))).convert('RGB')
image=ImageOps.fit(base,(640,1000),method=Image.Resampling.LANCZOS)
image=image.filter(ImageFilter.GaussianBlur(22))
image=ImageEnhance.Brightness(image).enhance(.55)
target.parent.mkdir(parents=True,exist_ok=True)
image.save(target,'WEBP',quality=76,method=6)
print('APPROVED_SCRATCH_BACKDROP',costume,'BYTES',target.stat().st_size)
