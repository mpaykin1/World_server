#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,statistics
from pathlib import Path
SAFE={'decodeConcurrency','distantTickHz','shadowUpdateIntervalFrames','reflectionUpdateIntervalFrames','farAudioUpdateHz','streamingPrefetchSeconds','animationFarHz','physicsSleepDelaySec','networkFarHz','backgroundBakeConcurrency'}
FORBIDDEN=('resolution','texture','geometry','lod','pixelratio','anisotropy','material','nearfield')

def propose(samples:list[dict],profile='default'):
    if not samples: raise ValueError('telemetry samples required')
    fps=[float(x.get('fps',0)) for x in samples if float(x.get('fps',0))>0]
    target=min(float(x.get('targetFps',60)) for x in samples)
    p10=statistics.quantiles(fps,n=10,method='inclusive')[0] if len(fps)>1 else fps[0]
    pressure=max(0.0,min(1.0,(target-p10)/max(target,1)))
    knobs={
      'decodeConcurrency':max(1,round(4-2*pressure)),
      'distantTickHz':max(1,round(4-2*pressure)),
      'shadowUpdateIntervalFrames':max(1,round(1+5*pressure)),
      'reflectionUpdateIntervalFrames':max(2,round(4+12*pressure)),
      'farAudioUpdateHz':max(2,round(8-4*pressure)),
      'streamingPrefetchSeconds':round(1.1+0.8*pressure,2),
      'animationFarHz':max(6,round(14-6*pressure)),
      'physicsSleepDelaySec':round(2.0+1.5*pressure,2),
      'networkFarHz':max(1,round(4-2*pressure)),
      'backgroundBakeConcurrency':max(1,round(2-pressure)),
    }
    assert set(knobs)<=SAFE and not any(any(f in k.lower() for f in FORBIDDEN) for k in knobs)
    source_reg=min(float(x.get('sourceFidelity',100)) for x in samples)
    visual_reg=min(float(x.get('visualScore',100)) for x in samples)
    if source_reg<100 or visual_reg<99.5: raise RuntimeError('quality evidence regressed; device schedule promotion forbidden')
    return {'schemaVersion':1,'mode':'ratchet-approved-per-device-schedule-v1','profile':profile,'sampleCount':len(samples),'targetFps':target,'p10Fps':round(p10,2),'pressure':round(pressure,4),'knobs':knobs,'qualityEvidence':{'sourceFidelityFloor':source_reg,'visualScoreFloor':visual_reg},'forbiddenQualityKnobs':['dynamicResolution','textureDownscale','geometryLod','nearFieldResolution','sourceRecompression']}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('telemetry');ap.add_argument('--profile',default='default');ap.add_argument('--out',default='quality/knowledge/device-schedules.json');a=ap.parse_args()
    raw=json.loads(Path(a.telemetry).read_text());samples=raw.get('samples',raw if isinstance(raw,list) else [])
    schedule=propose(samples,a.profile);p=Path(a.out);p.parent.mkdir(parents=True,exist_ok=True)
    existing={'schemaVersion':1,'schedules':{}}
    if p.exists(): existing=json.loads(p.read_text())
    existing.setdefault('schedules',{})[a.profile]=schedule;p.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pass':True,'profile':a.profile,'schedule':schedule},ensure_ascii=False,separators=(',',':')))
if __name__=='__main__':main()
