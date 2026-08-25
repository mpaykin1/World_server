#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,struct
from pathlib import Path

def sha256(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def png_size(p):
 b=Path(p).read_bytes()[:24]
 if b[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('only PNG dimension parser is built-in; other source textures stay whole')
 return struct.unpack('>II',b[16:24])
def build(path,page=256):
 w,h=png_size(path);pages=[]
 for y in range(0,h,page):
  for x in range(0,w,page):pages.append({'id':f'{x}:{y}','x':x,'y':y,'width':min(page,w-x),'height':min(page,h-y),'scale':1,'sourceResolution':True})
 return {'schemaVersion':1,'mode':'full-resolution-virtual-texture-plan-v1','source':str(path),'sourceSha256':sha256(path),'width':w,'height':h,'pageSize':page,'pages':pages,'sourceBytesModified':False,'resampling':False,'recompression':False,'fallback':'whole-source-texture'}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('texture');ap.add_argument('output');ap.add_argument('--page',type=int,default=256);a=ap.parse_args();d=build(a.texture,a.page);Path(a.output).write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({'pass':True,'pages':len(d['pages']),'sha256':d['sourceSha256']}))
if __name__=='__main__':main()
