#!/usr/bin/env python3
import argparse, json, math, os, sys
from pathlib import Path
try:
    from PIL import Image
    import numpy as np
except Exception as e:
    print(json.dumps({"ok":False,"error":"Missing Pillow/numpy","detail":str(e)}))
    sys.exit(11)

def image_metrics(path, crop=None):
    im=Image.open(path).convert('RGB')
    if crop:
        x,y,w,h=crop
        im=im.crop((x,y,x+w,y+h))
    arr=np.asarray(im).astype(np.float32)/255.0
    h,w,_=arr.shape
    lum=0.2126*arr[:,:,0]+0.7152*arr[:,:,1]+0.0722*arr[:,:,2]
    mx=arr.max(2); mn=arr.min(2); sat=np.where(mx>0,(mx-mn)/(mx+1e-6),0)
    gx=np.diff(lum,axis=1,prepend=lum[:,:1]); gy=np.diff(lum,axis=0,prepend=lum[:1,:]); grad=np.sqrt(gx*gx+gy*gy)
    bh,bw=max(1,h//16),max(1,w//16); stds=[]
    for yy in range(0,h,bh):
        for xx in range(0,w,bw): stds.append(float(lum[yy:min(h,yy+bh),xx:min(w,xx+bw)].std()))
    hist=np.histogram(lum,bins=64,range=(0,1))[0].astype(float); p=hist/max(1,hist.sum()); ent=float(-(p[p>0]*np.log2(p[p>0])).sum())
    warm=(arr[:,:,0]>arr[:,:,2]*1.25)&(arr[:,:,0]>arr[:,:,1]*1.05)&(lum>0.08)
    bright=lum>0.20; bottom=lum[int(h*.68):]; bottom_grad=grad[int(h*.68):]
    centroid=[None,None]
    if bright.any():
        ys,xs=np.nonzero(bright); centroid=[float(xs.mean()/w),float(ys.mean()/h)]
    return {
        'width':w,'height':h,'mean_luminance':float(lum.mean()),'p95_luminance':float(np.quantile(lum,.95)),
        'dark_ratio':float((lum<0.06).mean()),'mean_saturation':float(sat.mean()),'edge_density':float((grad>0.025).mean()),
        'gradient_mean':float(grad.mean()),'block_contrast_mean':float(np.mean(stds)),'luminance_entropy_bits':ent,
        'warm_pixel_ratio':float(warm.mean()),'bright_pixel_ratio':float(bright.mean()),
        'bottom_ui_occupancy_proxy':float(((bottom_grad>0.025)|(bottom>0.12)).mean()),'bright_centroid':centroid
    }

def clamp(v,a=0,b=100): return max(a,min(b,float(v)))
def floor_score(v,floor,target=None,higher=True):
    target=target if target is not None else floor*1.25
    if higher:
        if v>=target:return 100.0
        if v<=0:return 0.0
        if v<floor:return 82.0*v/max(1e-9,floor)
        return 82.0+18.0*(v-floor)/max(1e-9,target-floor)
    else:
        if v<=target:return 100.0
        if v>=floor:return 0.0
        return 100.0*(floor-v)/max(1e-9,floor-target)

def reference_similarity(a,b):
    keys=['mean_luminance','dark_ratio','mean_saturation','edge_density','block_contrast_mean','luminance_entropy_bits','warm_pixel_ratio','bottom_ui_occupancy_proxy']
    sims=[]
    for k in keys:
        av=float(a[k]); bv=float(b[k]); denom=max(abs(av),abs(bv),1e-5); sims.append(max(0.0,1.0-abs(av-bv)/denom))
    ac=a.get('bright_centroid',[None,None]); bc=b.get('bright_centroid',[None,None])
    if None not in ac and None not in bc:
        dist=math.hypot(ac[0]-bc[0],ac[1]-bc[1]); sims.append(max(0,1-dist/0.7))
    return round(100*sum(sims)/len(sims),2)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--reference',required=True); ap.add_argument('--candidate',required=True); ap.add_argument('--policy',required=True)
    ap.add_argument('--out',default='CINEMATIC_REFERENCE_REPORT.json'); ap.add_argument('--crop',default=''); ap.add_argument('--require-ui',action='store_true')
    args=ap.parse_args()
    crop=None
    if args.crop: crop=tuple(int(x) for x in args.crop.split(','))
    ref=image_metrics(args.reference); cand=image_metrics(args.candidate,crop)
    policy=json.loads(Path(args.policy).read_text(encoding='utf-8')); f=policy['referenceProxyFloors']
    checks={
      'luminance_band': f['meanLuminanceMin']<=cand['mean_luminance']<=f['meanLuminanceMax'],
      'dark_ratio': cand['dark_ratio']>=f['darkRatioMin'],
      'saturation': cand['mean_saturation']<=f['meanSaturationMax'],
      'edge_density': cand['edge_density']>=f['edgeDensityMin'],
      'block_contrast': cand['block_contrast_mean']>=f['blockContrastMeanMin'],
      'entropy': cand['luminance_entropy_bits']>=f['luminanceEntropyBitsMin'],
      'warm_focus': cand['warm_pixel_ratio']>=f['warmPixelRatioMin']
    }
    if args.require_ui: checks['navigator_ui_proxy']=cand['bottom_ui_occupancy_proxy']>=f['bottomUiOccupancyProxyMinWhenRequired']
    component={
      'darkness':floor_score(cand['dark_ratio'],f['darkRatioMin'],.78),
      'edge_detail':floor_score(cand['edge_density'],f['edgeDensityMin'],max(.055,f['edgeDensityMin']*1.4)),
      'local_contrast':floor_score(cand['block_contrast_mean'],f['blockContrastMeanMin'],.031),
      'tonal_complexity':floor_score(cand['luminance_entropy_bits'],f['luminanceEntropyBitsMin'],2.85),
      'warm_light':floor_score(cand['warm_pixel_ratio'],f['warmPixelRatioMin'],.035),
      'ui_proxy':100.0 if not args.require_ui else floor_score(cand['bottom_ui_occupancy_proxy'],f['bottomUiOccupancyProxyMinWhenRequired'],.135),
      'saturation_control':floor_score(cand['mean_saturation'],f['meanSaturationMax'],.34,higher=False),
      'luminance_control':100.0 if checks['luminance_band'] else 45.0
    }
    perceptual=round(sum(component.values())/len(component),2); similarity=reference_similarity(ref,cand)
    score=round(perceptual*.72+similarity*.28,2)
    result={'ok':all(checks.values()) and perceptual>=f['perceptualProxyScoreMin'],'score':score,'perceptualProxyScore':perceptual,'referenceSimilarityProxy':similarity,'checks':checks,'components':component,'candidate':cand,'reference':ref,'note':'Automated proxy score. Human/AI visual review remains required before claiming 100% aesthetic match.'}
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))
    sys.exit(0 if result['ok'] else 9)
if __name__=='__main__': main()
