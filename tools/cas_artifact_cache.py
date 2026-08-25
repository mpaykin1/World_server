#!/usr/bin/env python3
from __future__ import annotations
import argparse,hashlib,json,os,shutil,subprocess
from pathlib import Path

def sha256(path:Path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def object_key(path:Path,kind='derived'):
 s=sha256(path);return f'{kind}/{s[:2]}/{s}'

def put_local(src:Path,root:Path,kind='derived'):
 key=object_key(src,kind);dst=root/key;dst.parent.mkdir(parents=True,exist_ok=True)
 if dst.exists() and sha256(dst)!=sha256(src):raise RuntimeError('CAS collision/hash mismatch')
 if not dst.exists():shutil.copy2(src,dst)
 return {'key':key,'sha256':sha256(src),'path':str(dst),'cacheHit':dst.exists(),'sourceModified':False}

def r2_put(src:Path,key:str):
 bucket=os.getenv('QUALITY_R2_BUCKET');
 if not bucket:return {'configured':False}
 exe=shutil.which('wrangler') or shutil.which('npx')
 if not exe:return {'configured':True,'uploaded':False,'reason':'wrangler unavailable'}
 cmd=[exe,'wrangler','r2','object','put',f'{bucket}/{key}','--file',str(src)] if Path(exe).name=='npx' else [exe,'r2','object','put',f'{bucket}/{key}','--file',str(src)]
 p=subprocess.run(cmd,text=True,capture_output=True)
 return {'configured':True,'uploaded':p.returncode==0,'returncode':p.returncode,'stdout':p.stdout[-1000:],'stderr':p.stderr[-1000:]}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('file');ap.add_argument('--root',default='.quality-cas');ap.add_argument('--kind',default='derived');ap.add_argument('--r2',action='store_true');a=ap.parse_args();src=Path(a.file)
 before=sha256(src);r=put_local(src,Path(a.root),a.kind);r['sourceShaBefore']=before;r['sourceShaAfter']=sha256(src);r['sourceAssetModified']=before!=r['sourceShaAfter'];
 if a.r2:r['r2']=r2_put(src,r['key'])
 print(json.dumps(r,separators=(',',':')))
if __name__=='__main__':main()
