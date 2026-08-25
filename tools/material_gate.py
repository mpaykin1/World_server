#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, struct
from pathlib import Path
from quality_common import inspect_asset

def glb_doc(path:Path):
 with path.open('rb') as f:
  magic,version,length=struct.unpack('<4sII',f.read(12));
  if magic!=b'glTF':raise ValueError('not glb')
  n,t=struct.unpack('<II',f.read(8));
  if t!=0x4E4F534A:raise ValueError('missing JSON chunk')
  return json.loads(f.read(n).decode('utf8').rstrip('\x00 \t\r\n'))
def validate(path:Path):
 info=inspect_asset(path);errors=[];warnings=[];metrics={'type':info['type']}
 if info['type']=='glb':
  d=glb_doc(path);imgs=d.get('images',[]);tex=d.get('textures',[]);mats=d.get('materials',[]);metrics.update(images=len(imgs),textures=len(tex),materials=len(mats))
  for i,t in enumerate(tex):
   if 'source' not in t or not (0<=t['source']<len(imgs)):errors.append(f'texture {i} has invalid image source')
  for i,m in enumerate(mats):
   p=m.get('pbrMetallicRoughness',{});bc=p.get('baseColorTexture',{}).get('index');mr=p.get('metallicRoughnessTexture',{}).get('index');nm=m.get('normalTexture',{}).get('index');em=m.get('emissiveTexture',{}).get('index')
   for label,idx in [('baseColor',bc),('metalRough',mr),('normal',nm),('emissive',em)]:
    if idx is not None and not (0<=idx<len(tex)):errors.append(f'material {i} {label} texture index invalid')
 elif info['type']=='ply-mesh':
  props=set(info.get('properties') or []);has_color={'red','green','blue'}<=props;metrics['vertexColors']=has_color
  if not has_color:warnings.append('PLY mesh has no vertex colors; runtime will use neutral material')
 elif info['type'] in ('ply-splat','spz'):metrics['renderer']='spark-native'
 return {'pass':not errors,'errors':errors,'warnings':warnings,'metrics':metrics}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('asset',type=Path);a=ap.parse_args();r=validate(a.asset.resolve());print(json.dumps(r,ensure_ascii=False,indent=2));raise SystemExit(0 if r['pass'] else 1)
if __name__=='__main__':main()
