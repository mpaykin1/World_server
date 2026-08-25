#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
PROFILES={
 'generic':{'roughness':.62,'normal_strength':2.0,'ao_strength':.55},'stone':{'roughness':.82,'normal_strength':3.2,'ao_strength':.78},
 'metal':{'roughness':.34,'normal_strength':1.7,'ao_strength':.46},'wood':{'roughness':.66,'normal_strength':2.5,'ao_strength':.62},
 'cloth':{'roughness':.74,'normal_strength':1.25,'ao_strength':.40},'skin':{'roughness':.48,'normal_strength':.9,'ao_strength':.28}}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def u8(a):return np.clip(a*255.,0,255).astype(np.uint8)
def sobel(g):
 p=np.pad(g,1,mode='edge');gx=(p[:-2,2:]+2*p[1:-1,2:]+p[2:,2:])-(p[:-2,:-2]+2*p[1:-1,:-2]+p[2:,:-2]);gy=(p[2:,:-2]+2*p[2:,1:-1]+p[2:,2:])-(p[:-2,:-2]+2*p[:-2,1:-1]+p[:-2,2:]);return gx,gy
def bake(src,out,semantic,size):
 out=Path(out);out.mkdir(parents=True,exist_ok=True);prof=PROFILES.get(semantic,PROFILES['generic']);img=src.convert('RGB')
 if max(img.size)>size:img.thumbnail((size,size),Image.Resampling.LANCZOS)
 img=ImageOps.autocontrast(img,cutoff=.2);img=ImageEnhance.Sharpness(img).enhance(1.12);albedo=np.asarray(img).astype(np.float32)/255.;gray=albedo[...,0]*.2126+albedo[...,1]*.7152+albedo[...,2]*.0722
 b1=np.asarray(Image.fromarray(u8(gray)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)/255.;b4=np.asarray(Image.fromarray(u8(gray)).filter(ImageFilter.GaussianBlur(4.0))).astype(np.float32)/255.;detail=np.clip((gray-b4)*.75+.5,0,1);height=np.clip(.65*gray+.35*detail,0,1)
 gx,gy=sobel(height);s=float(prof['normal_strength']);nx=-gx*s;ny=-gy*s;nz=np.ones_like(nx);n=np.sqrt(nx*nx+ny*ny+nz*nz)+1e-8;normal=np.stack((nx/n*.5+.5,ny/n*.5+.5,nz/n*.5+.5),axis=-1)
 contrast=np.abs(gray-b1);rough=np.clip(float(prof['roughness'])+contrast*.8-(detail-.5)*.18,.04,.98);cavity=np.clip(b4-gray,0,1);ao=np.clip(1-cavity*float(prof['ao_strength'])*2.2,.18,1)
 maps={'albedo.png':Image.fromarray(u8(albedo),'RGB'),'normal.png':Image.fromarray(u8(normal),'RGB'),'roughness.png':Image.fromarray(u8(rough),'L'),'ao.png':Image.fromarray(u8(ao),'L'),'height.png':Image.fromarray(u8(height),'L')}
 for nme,im in maps.items():im.save(out/nme,optimize=True)
 manifest={'schemaVersion':'5.0.0','semantic':semantic,'cpuOnly':True,'dimensions':[img.width,img.height],'algorithm':'multiscale-luminance-sobel-pbr-v1','maps':{k:sha(out/k) for k in maps}};(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');return manifest
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--input');ap.add_argument('--out',required=True);ap.add_argument('--semantic',default='generic',choices=sorted(PROFILES));ap.add_argument('--size',type=int,default=1024);ap.add_argument('--smoke',action='store_true');a=ap.parse_args()
 if a.smoke:
  h=w=160;y,x=np.mgrid[0:h,0:w];b=np.sin(x/9.)*.13+np.cos(y/13.)*.09+.55;rgb=np.stack((b*.9,b*.82,b*.72),axis=-1);src=Image.fromarray(u8(np.clip(rgb,0,1)),'RGB')
 elif a.input:src=Image.open(a.input)
 else:raise SystemExit('--input or --smoke required')
 print(json.dumps(bake(src,a.out,a.semantic,a.size)))
if __name__=='__main__':main()
