from __future__ import annotations
import json, math
from pathlib import Path

class WorldQualityEnhancer:
 VERSION='4.0.0'; STRATEGY='semantic_multiscale_architecture_material_aware'
 @staticmethod
 def _hash(x,y,s):
  h=((x*374761393)^(y*668265263)^s)&0xffffffff;h^=h>>13;h=(h*1274126177)&0xffffffff;h^=h>>16;return(h&0xffffffff)/0xffffffff
 @staticmethod
 def _rgb(c):return((c>>16)&255,(c>>8)&255,c&255)
 @classmethod
 def _luma(cls,c):
  r,g,b=cls._rgb(c);return(.299*r+.587*g+.114*b)/255
 @classmethod
 def _chroma(cls,c):
  a=cls._rgb(c);return(max(a)-min(a))/255
 @classmethod
 def _material_profile(cls,c):
  r,g,b=cls._rgb(c);mx,mn=max(r,g,b),min(r,g,b);lum=cls._luma(c);ch=(mx-mn)/255;warm=(r-b)/255;green=(g-max(r,b))/255
  kind='stone'
  if lum>.58 and warm>.12 and ch>.16:kind='emissive'
  elif lum<.42 and ch<.13:kind='metal'
  elif green>.08:kind='vegetation'
  elif warm>.12 and lum<.58:kind='wood'
  table={'stone':(.88,.03,0,.72,.82),'metal':(.42,.72,0,.46,.70),'vegetation':(.96,0,0,.60,.72),'wood':(.80,.01,0,.58,.78),'emissive':(.38,.04,min(2.2,max(.8,.8+(lum-.58)*3)),.20,.45)}
  rough,metal,emissive,normal,ao=table[kind]
  return {'color':c,'materialClass':kind,'roughness':rough,'metalness':metal,'emissiveIntensity':round(emissive,3),'normalStrength':normal,'aoStrength':ao,'luma':round(lum,4),'chroma':round(ch,4)}
 @staticmethod
 def _front(vs):
  d={}
  for v in vs:
   if not isinstance(v,list) or len(v)<4:continue
   x,y,z,c=map(int,v[:4]);k=(x,y)
   if k not in d or z>d[k][0]:d[k]=(z,c)
  return d
 def enhance_voxel_world(self,world_path:Path,params:dict|None=None)->Path:
  params=params or {}
  if not world_path.is_file():return world_path
  w=json.loads(world_path.read_text(encoding='utf-8'));vox=w.get('voxels') or [];pal=w.get('palette') or []
  if not vox or not pal or params.get('qualityAutopilot') is False:return world_path
  source=[list(v) for v in vox if isinstance(v,list) and len(v)>=4];occ={(int(v[0]),int(v[1]),int(v[2])) for v in source};cells={}
  for v in source:
   x,y,z,c=map(int,v[:4]);k=(x,y)
   if k not in cells:cells[k]={'x':x,'y':y,'front':z,'back':z,'color':c}
   else:
    q=cells[k]
    if z>q['front']:q['front'],q['color']=z,c
    q['back']=min(q['back'],z)
  ys=sorted(c['y'] for c in cells.values());ymin=ys[0] if ys else 0;ymax=ys[-1] if ys else 1;yspan=max(1,ymax-ymin)
  ratio=min(.6,max(0,float(params.get('qualityDetailRatio',.28))));max_added=min(int(params.get('qualityMaxAddedVoxels',42000)),int(len(source)*ratio));threshold=min(1,max(.02,float(params.get('qualityEdgeThreshold',.12))));density=min(1,max(0,float(params.get('qualityEdgeDensity',.9))));max_depth=min(8,max(1,int(params.get('qualityMaxBackReliefDepth',5))));roof_depth=min(6,max(1,int(params.get('qualityRoofBackReliefDepth',4))));cornice=max(3,min(12,int(params.get('qualityCorniceSpacing',5))));pillar=max(3,min(14,int(params.get('qualityPillarSpacing',6))));rear_fill=max(0,min(5,int(params.get('qualityRearMassFillDepth',3))));window_depth=max(1,min(4,int(params.get('qualityWindowRecessDepth',2))));spire_depth=max(2,min(8,int(params.get('qualitySpireBackDepth',5))));ground_depth=max(0,min(2,int(params.get('qualityGroundMicroReliefDepth',1))));seed=int(params.get('qualitySeed',w.get('source',{}).get('gridWidth',0)*131+w.get('source',{}).get('gridHeight',0)*977+0x61b9));adds=[]
  stats={'cells':len(cells),'roof':0,'windowLike':0,'verticalEdge':0,'spireLike':0,'groundBand':0,'highSaliency':0,'corniceCandidates':0,'pillarCandidates':0,'rearMassCandidates':0,'windowRecesses':0,'spireRelief':0,'groundMicroRelief':0}
  def at(x,y):return cells.get((x,y))
  def color(i):return int(pal[i]) if 0<=int(i)<len(pal) else 0
  def add(x,y,z,c):
   if len(adds)>=max_added or (x,y,z) in occ:return False
   occ.add((x,y,z));adds.append([int(x),int(y),int(z),int(c)]);return True
  intents={};cand=[]
  for c in cells.values():
   if c['y']<=0:continue
   here=self._luma(color(c['color']));here_ch=self._chroma(color(c['color']));edge=0.;dv=0.;missing=0
   for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
    n=at(c['x']+dx,c['y']+dy)
    if not n:missing+=1;edge=max(edge,.42);continue
    edge=max(edge,abs(here-self._luma(color(n['color']))));dv=max(dv,min(1,abs(c['front']-n['front'])/5))
   roof=at(c['x'],c['y']+1) is None;ground=(c['y']-ymin)/yspan<.16;bright=here>.55 and here_ch>.12;up,down=at(c['x'],c['y']+1),at(c['x'],c['y']-1);left,right=at(c['x']-1,c['y']),at(c['x']+1,c['y']);vertical=missing>0 or dv>.2 or left is None or right is None;window=bright and not roof and up is not None and down is not None and (edge>.08 or dv>.08);support=sum(1 for dx in range(-3,4) if at(c['x']+dx,c['y']));spire=roof and not ground and support<=4 and ((c['y']-ymin)/yspan>.42);sal=min(1,edge*.9+dv*.7+(.24 if roof else 0)+(.28 if window else 0)+(.34 if spire else 0)+here_ch*.10)
   if roof:stats['roof']+=1
   if window:stats['windowLike']+=1
   if vertical:stats['verticalEdge']+=1
   if spire:stats['spireLike']+=1
   if ground:stats['groundBand']+=1
   if sal>.55:stats['highSaliency']+=1
   intents[(c['x'],c['y'])]={'roof':roof,'ground':ground,'window':window,'spire':spire,'vertical':vertical,'saliency':sal}
   edge2=min(1,edge+dv*.58);co=(c['y']%cornice==0 and edge2>.16);pi=(c['x']%pillar==0 and (vertical or missing>0));score=edge2*1.28+(.34 if roof else 0)+(.20 if co else 0)+(.20 if pi else 0)+(.30 if window else 0)+(.42 if spire else 0)+(.18 if vertical else 0)+(.08 if ground else 0)+here_ch*.10+min(1,abs(c['y'])/64)*.07
   if co:stats['corniceCandidates']+=1
   if pi:stats['pillarCandidates']+=1
   cand.append((score,c,edge2,roof,co,pi,window,spire,ground,vertical))
  cand.sort(key=lambda a:(-a[0],a[1]['y'],a[1]['x']))
  for score,c,edge,roof,co,pi,window,spire,ground,vertical in cand:
   if len(adds)>=max_added:break
   if edge<threshold and not(window or spire or roof or vertical):continue
   if self._hash(c['x'],c['y'],seed)>min(1,density*(.20+score*.64)):continue
   start=c['back']-1;depth=max(1,min(max_depth,1+int(math.floor(edge*max_depth))+(1 if co else 0)+(1 if pi else 0)))
   if roof:depth=max(depth,roof_depth)
   if spire:depth=max(depth,spire_depth)
   for d in range(depth):
    if not add(c['x'],c['y'],start-d,c['color']):break
   if rear_fill and score>.50:
    stats['rearMassCandidates']+=1
    for d in range(depth,min(max_depth+rear_fill,depth+rear_fill)):add(c['x'],c['y'],start-d,c['color'])
   if window:
    stats['windowRecesses']+=1
    for d in range(window_depth):add(c['x'],c['y'],start-depth-d,c['color'])
   if spire:
    stats['spireRelief']+=1
    for d in range(depth,min(spire_depth+2,depth+2)):add(c['x'],c['y'],start-d,c['color'])
   if ground and ground_depth and ((c['x']+c['y'])&1)==0:
    stats['groundMicroRelief']+=1
    for d in range(ground_depth):add(c['x'],c['y'],start-depth-d,c['color'])
   if co:
    for n in (at(c['x']-1,c['y']),at(c['x']+1,c['y'])):
     if n:add(n['x'],n['y'],n['back']-1-depth,n['color'])
   if pi:
    for n in (at(c['x'],c['y']-1),at(c['x'],c['y']+1)):
     if n:add(n['x'],n['y'],n['back']-1-depth,n['color'])
  enhanced=source+adds
  if self._front(source)!=self._front(enhanced):raise RuntimeError('WORLD_QUALITY_AUTOPILOT_V4 front-projection invariant violated')
  w['voxels']=enhanced;w['materialProfiles']=[self._material_profile(int(c)) for c in pal]
  perf=dict(w.get('performance') or {});perf.update({'logicalRepresentation':'cubes','browserMeshing':'chunked_greedy_surface','internalFaceCulling':True,'farLod':'chunk_aabb_hlod','streaming':'camera_or_player_centered','adaptiveResolution':True,'worldQualityAutopilot':True,'gpuTimingTarget':True,'visibilityBudgetTarget':True,'longTaskBudgetTarget':True,'deviceProfileTarget':True,'pbrTierTarget':True});w['performance']=perf
  w['qualityAutopilot']={'version':self.VERSION,'strategy':self.STRATEGY,'enabled':True,'deterministic':True,'seed':seed,'sourceVoxels':len(source),'addedVoxels':len(adds),'addedRatio':round(len(adds)/max(1,len(source)),4),'finalVoxels':len(enhanced),'frontProjectionPreserved':True,'mutationDirection':'behind_reference_front_shell_only','budgetLimited':len(adds)>=max_added if max_added>0 else False,'semanticStats':stats,'materialProfileCount':len(w['materialProfiles']),'prioritySorted':True}
  st=dict(w.get('stats') or {});st['logicalVoxelsBeforeAutopilot']=len(source);st['qualityAutopilotAddedVoxels']=len(adds);st['logicalVoxels']=len(enhanced);w['stats']=st
  world_path.write_text(json.dumps(w,ensure_ascii=False,separators=(',',':')),encoding='utf-8');return world_path
