from __future__ import annotations
import argparse, json, os, time
from pathlib import Path
import requests

API='https://apis.roblox.com/assets/v1/assets'

def auth_headers():
    key=os.environ.get('ROBLOX_OPEN_CLOUD_API_KEY') or os.environ.get('AI3D_ROBLOX_API_KEY')
    token=os.environ.get('ROBLOX_OPEN_CLOUD_OAUTH_TOKEN')
    if key:return {'x-api-key':key}
    if token:return {'Authorization':'Bearer '+token}
    raise RuntimeError('Roblox Open Cloud credentials are not configured')

def creator():
    uid=os.environ.get('ROBLOX_CREATOR_USER_ID'); gid=os.environ.get('ROBLOX_CREATOR_GROUP_ID')
    if gid:return {'groupId':int(gid)}
    if uid:return {'userId':int(uid)}
    raise RuntimeError('ROBLOX_CREATOR_USER_ID or ROBLOX_CREATOR_GROUP_ID is required')

def upload(path:Path, asset_type:str, display_name:str, content_type:str):
    req={'assetType':asset_type,'displayName':display_name[:50],'description':'World_server AI3D V7 verified asset','creationContext':{'creator':creator()}}
    with path.open('rb') as f:
        r=requests.post(API,headers=auth_headers(),data={'request':json.dumps(req)},files={'fileContent':(path.name,f,content_type)},timeout=120)
    r.raise_for_status(); data=r.json(); operation=data.get('path') or data.get('operationPath')
    if not operation:return data
    op_url='https://apis.roblox.com/assets/v1/'+operation.lstrip('/') if operation.startswith('operations/') else 'https://apis.roblox.com/'+operation.lstrip('/')
    for _ in range(60):
        q=requests.get(op_url,headers=auth_headers(),timeout=30);q.raise_for_status();op=q.json()
        if op.get('done'):
            if op.get('error'): raise RuntimeError(json.dumps(op['error']))
            return op
        time.sleep(2)
    raise TimeoutError('Roblox asset operation did not finish')

def find_asset_id(obj):
    if isinstance(obj,dict):
        for key,val in obj.items():
            if key.lower() in {'assetid','asset_id'} and str(val).isdigit():return str(val)
            found=find_asset_id(val)
            if found:return found
    if isinstance(obj,list):
        for val in obj:
            found=find_asset_id(val)
            if found:return found
    return None

def main():
    p=argparse.ArgumentParser();p.add_argument('--plan',required=True,type=Path);p.add_argument('--output',default='roblox-upload-result-v7.json',type=Path);a=p.parse_args();plan=json.loads(a.plan.read_text(encoding='utf-8'));results={}
    for item in plan.get('assets') or []:
        path=Path(item['path']); result=upload(path,item['assetType'],item.get('displayName',path.stem),item['contentType']); aid=find_asset_id(result)
        if not aid: raise RuntimeError('Roblox operation completed without a numeric assetId')
        results[item['key']]={'assetId':aid,'raw':result}
    out={'schemaVersion':7,'status':'UPLOADED','assetIds':{k:v['assetId'] for k,v in results.items()},'details':results};a.output.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(out))
if __name__=='__main__':main()
