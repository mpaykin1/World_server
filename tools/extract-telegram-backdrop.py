"""Extract and soften the approved Scratch backdrop for portrait Telegram gutters."""
from pathlib import Path
from PIL import Image,ImageOps,ImageFilter,ImageEnhance
import zipfile,json,io,sys,hashlib
source=Path(sys.argv[1])
approved='8fe1553124471d126e1ff61928bfb4e9693c5c5a3473c88140eb82f8ff5e715e'
if hashlib.sha256(source.read_bytes()).hexdigest()!=approved:
    raise SystemExit('Refusing an unapproved Scratch source')
target=Path(__file__).resolve().parents[1]/'apps/telegram-miniapp/backdrop.webp'
with zipfile.ZipFile(source) as archive:
    project=json.loads(archive.read('project.json'))
    stage=next(t for t in project['targets'] if t['isStage'])
    costume=stage['costumes'][0]['md5ext']
    if costume!='ff37a6766df268bfc36072fe47cc734f.png':
        raise SystemExit('Approved stage backdrop identity mismatch')
    raw=archive.read(costume)
    if hashlib.md5(raw).hexdigest()!=costume.split('.')[0]:
        raise SystemExit('Stage backdrop checksum mismatch')
    base=Image.open(io.BytesIO(raw)).convert('RGB')
image=ImageOps.fit(base,(640,1000),method=Image.Resampling.LANCZOS)
image=image.filter(ImageFilter.GaussianBlur(22))
image=ImageEnhance.Brightness(image).enhance(.55)
target.parent.mkdir(parents=True,exist_ok=True)
image.save(target,'WEBP',quality=76,method=6)
print('APPROVED_SCRATCH_BACKDROP',costume,'BYTES',target.stat().st_size)
