(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InkGlyphWorldCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GENERATOR_VERSION = '3.0.0';
  const PRESETS = Object.freeze(['city','temple','mountain','monolith']);

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function hashString(value) {
    let h = 2166136261 >>> 0;
    for (const ch of String(value)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  function recipeKey(parts) {
    return `igw:${GENERATOR_VERSION}:${hashString(stableStringify(parts)).toString(16).padStart(8,'0')}`;
  }

  function cleanMask(alpha, width, height, options = {}) {
    if (!alpha || alpha.length !== width * height) throw new Error('alpha mask size mismatch');
    const threshold = clamp(Number(options.threshold ?? 0.24), 0, 1) * 255;
    const minNeighbors = Math.max(0, Math.min(8, Number(options.minNeighbors ?? 1) | 0));
    const out = new Uint8Array(alpha.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (alpha[i] < threshold) continue;
        let n = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const xx = x + ox, yy = y + oy;
          if (xx >= 0 && yy >= 0 && xx < width && yy < height && alpha[yy * width + xx] >= threshold) n++;
        }
        if (n >= minNeighbors) out[i] = alpha[i];
      }
    }
    return out;
  }

  function distanceField(mask, width, height) {
    if (!mask || mask.length !== width * height) throw new Error('mask size mismatch');
    const INF = 1e9, d = new Float32Array(mask.length), diag = Math.SQRT2;
    for (let i=0;i<mask.length;i++) d[i] = mask[i] ? INF : 0;
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      const i=y*width+x; if (!mask[i]) continue;
      let v=d[i];
      if (x>0) v=Math.min(v,d[i-1]+1);
      if (y>0) v=Math.min(v,d[i-width]+1);
      if (x>0&&y>0) v=Math.min(v,d[i-width-1]+diag);
      if (x+1<width&&y>0) v=Math.min(v,d[i-width+1]+diag);
      d[i]=v;
    }
    for (let y=height-1;y>=0;y--) for (let x=width-1;x>=0;x--) {
      const i=y*width+x; if (!mask[i]) continue;
      let v=d[i];
      if (x+1<width) v=Math.min(v,d[i+1]+1);
      if (y+1<height) v=Math.min(v,d[i+width]+1);
      if (x+1<width&&y+1<height) v=Math.min(v,d[i+width+1]+diag);
      if (x>0&&y+1<height) v=Math.min(v,d[i+width-1]+diag);
      d[i]=v;
    }
    return d;
  }

  function sampleMask(mask, width, height, options = {}) {
    if (!mask || mask.length !== width * height) throw new Error('mask size mismatch');
    const maxCells = Math.max(128, Number(options.maxCells ?? 9000) | 0);
    let activeCount = 0;
    for (let i=0;i<mask.length;i++) if (mask[i] > 0) activeCount++;
    const step = activeCount <= maxCells ? 1 : Math.max(1, Math.ceil(Math.sqrt(activeCount / maxCells)));
    const sampled = [];
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
      let best = 0, bestX = x, bestY = y;
      for (let yy = y; yy < Math.min(y + step, height); yy++) for (let xx = x; xx < Math.min(x + step, width); xx++) {
        const a = mask[yy * width + xx]; if (a > best) { best = a; bestX = xx; bestY = yy; }
      }
      if (best) sampled.push({ x: bestX, y: bestY, alpha: best / 255, sourceIndex: bestY*width+bestX });
    }
    return { sampled, step, activeCount };
  }

  function localDegree(mask,width,height,x,y) {
    let n=0;
    for (let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++) {
      if(!ox&&!oy) continue; const xx=x+ox,yy=y+oy;
      if(xx>=0&&yy>=0&&xx<width&&yy<height&&mask[yy*width+xx]) n++;
    }
    return n;
  }

  function roleFor(sample, mask, width, height, dist, seed) {
    const d = dist[sample.sourceIndex] || 0;
    const degree = localDegree(mask,width,height,sample.x,sample.y);
    const h = hashString(`${seed}:${sample.x}:${sample.y}`) / 4294967295;
    if (d <= 1.45 || degree <= 3) return 'wall';
    if (d >= 3.4 && degree >= 6 && h > 0.88) return 'tower';
    if (d >= 2.2 && degree >= 5) return 'building';
    return 'road';
  }

  function roleHeight(role, tone, rng, minHeight, maxHeight, preset) {
    const range = Math.max(0.2,maxHeight-minHeight);
    if (preset === 'mountain') {
      if (role==='road') return minHeight*(0.25+tone*.3);
      if (role==='wall') return minHeight+range*(0.25+tone*.35);
      if (role==='tower') return minHeight+range*(0.75+tone*.25);
      return minHeight+range*(0.4+tone*.5);
    }
    if (preset === 'monolith') return minHeight+range*clamp(tone*(0.82+rng()*.22),0,1);
    if (preset === 'temple') {
      if (role==='road') return .28+.18*tone;
      if (role==='wall') return minHeight+range*(.22+.22*tone);
      if (role==='tower') return minHeight+range*(.74+.24*tone);
      return minHeight+range*(.38+.35*tone);
    }
    if (role==='road') return .24+.22*tone;
    if (role==='wall') return minHeight+range*(.18+.22*tone);
    if (role==='tower') return minHeight+range*(.72+.26*tone);
    return minHeight+range*(.32+.38*tone);
  }

  function baseMaskToWorld(mask, width, height, options = {}) {
    const seedText = String(options.seed ?? 'ink-glyph-world');
    const seed = hashString(seedText), rng = mulberry32(seed);
    const minHeight = Math.max(0.3, Number(options.minHeight ?? 1.2));
    const maxHeight = Math.max(minHeight, Number(options.maxHeight ?? 8));
    const heightPower = Math.max(0.2, Number(options.heightPower ?? 1.15));
    const scatter = clamp(Number(options.scatter ?? 0.035), 0, 0.25);
    const preset = PRESETS.includes(options.preset) ? options.preset : 'city';
    const { sampled, step, activeCount } = sampleMask(mask, width, height, { maxCells: options.maxCells ?? 9000 });
    const dist = distanceField(mask,width,height);
    const cells = [], roles={road:0,wall:0,building:0,tower:0,splatter:0};
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    for (const s of sampled) {
      const tone = Math.pow(s.alpha, heightPower);
      const role = preset==='monolith' ? 'building' : roleFor(s,mask,width,height,dist,seedText);
      const h = clamp(roleHeight(role,tone,rng,minHeight,maxHeight,preset),.15,maxHeight);
      const baseCell={ x: (s.x - cx) / step, z: (s.y - cy) / step, height: h, alpha: s.alpha, kind: 'stroke', role, sourceX:s.x, sourceY:s.y };
      cells.push(baseCell);
      roles[role] = (roles[role]||0)+1;
      if (rng() < scatter * s.alpha) {
        const angle = rng() * Math.PI * 2, d = 1.5 + rng() * 5.5;
        cells.push({ x: baseCell.x + Math.cos(angle) * d, z: baseCell.z + Math.sin(angle) * d, height: Math.min(maxHeight,minHeight*(0.35+rng()*.8)), alpha: s.alpha * 0.55, kind: 'splatter', role:'splatter', sourceX:s.x, sourceY:s.y });
        roles.splatter++;
      }
    }
    const density = activeCount ? sampled.length/activeCount : 0;
    return {
      schemaVersion: 3, generatorVersion: GENERATOR_VERSION, preset, seed: seedText,
      width: Math.ceil(width / step), height: Math.ceil(height / step), sourceWidth: width, sourceHeight: height,
      activeCount, sampledCount: sampled.length, instanceCount: cells.length, samplingStep: step,
      quality: { samplingDensity:Number(density.toFixed(4)), silhouettePreserved: sampled.length>0, bounded:cells.length <= (Number(options.maxCells??9000)+Math.ceil(Number(options.maxCells??9000)*scatter)+16) },
      roles, cells
    };
  }

  function downsampleMedian(points, maxPoints=28) {
    if (!Array.isArray(points) || !points.length) return [];
    if (points.length <= maxPoints) return points;
    const out=[];
    for(let i=0;i<maxPoints;i++) out.push(points[Math.round(i*(points.length-1)/(maxPoints-1))]);
    return out;
  }

  function assignStrokeOrder(cells, strokeData, sourceWidth, sourceHeight) {
    const medians = Array.isArray(strokeData?.medians) ? strokeData.medians.map(m=>downsampleMedian(m)) : [];
    if (!medians.length) {
      const denom=Math.max(1,sourceHeight-1);
      for(const c of cells){const y=clamp(Number(c.sourceY||0)/denom,0,1),x=clamp(Number(c.sourceX||0)/Math.max(1,sourceWidth-1),0,1);c.strokeIndex=0;c.strokeT=clamp(y*.88+x*.12,0,1);c.drawOrder=c.strokeT;c.strokeSource='procedural';}
      return {source:'procedural',strokeCount:1,assigned:cells.length};
    }
    const mapped=medians.map(points=>points.map((p,i)=>({
      x: clamp(Number(p?.[0]||0)/1024,0,1)*Math.max(1,sourceWidth-1),
      y: (1-clamp(Number(p?.[1]||0)/1024,0,1))*Math.max(1,sourceHeight-1),
      t: points.length>1?i/(points.length-1):0
    })));
    for(const c of cells){
      let best=Infinity,bestStroke=0,bestT=0;
      for(let si=0;si<mapped.length;si++) for(const p of mapped[si]){
        const dx=(c.sourceX||0)-p.x,dy=(c.sourceY||0)-p.y,d=dx*dx+dy*dy;
        if(d<best){best=d;bestStroke=si;bestT=p.t;}
      }
      c.strokeIndex=bestStroke;c.strokeT=bestT;c.drawOrder=clamp((bestStroke+bestT)/mapped.length,0,1);c.strokeSource='hanzi-writer-data';
      if(c.kind==='splatter')c.drawOrder=clamp(c.drawOrder+.012,0,1);
    }
    return {source:'hanzi-writer-data',strokeCount:mapped.length,assigned:cells.length};
  }

  function buildNavGraph(world, options={}) {
    const cells=world?.cells||[],maxNodes=Math.max(32,Number(options.maxNavNodes??2600)|0),bucket=new Map();
    for(let i=0;i<cells.length;i++){
      const c=cells[i];if(c.kind==='splatter')continue;
      const walkable=c.role==='road'||(c.height<=Number(options.maxWalkHeight??0.72)&&c.role!=='tower');if(!walkable)continue;
      const qx=Math.round(c.x),qz=Math.round(c.z),key=`${qx},${qz}`,old=bucket.get(key);
      if(!old||c.height<old.cell.height)bucket.set(key,{cell:c,cellIndex:i,qx,qz});
    }
    let raw=[...bucket.values()];
    if(raw.length>maxNodes){const stride=Math.ceil(raw.length/maxNodes);raw=raw.filter((n,i)=>i%stride===0||n.cell.role==='road'&&hashString(`${n.qx}:${n.qz}`)%stride===0).slice(0,maxNodes);}
    const keyToId=new Map(),nodes=raw.map((n,id)=>{keyToId.set(`${n.qx},${n.qz}`,id);return{id,x:n.cell.x,y:Math.max(.02,n.cell.height),z:n.cell.z,cellIndex:n.cellIndex,edges:[]}});
    const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for(let id=0;id<raw.length;id++){const n=raw[id];for(const [dx,dz] of dirs){const other=keyToId.get(`${n.qx+dx},${n.qz+dz}`);if(other===undefined||other===id)continue;const a=nodes[id],b=nodes[other],horizontal=Math.hypot(a.x-b.x,a.z-b.z);if(horizontal<=1.75&&Math.abs(a.y-b.y)<=Number(options.maxStepHeight??0.8))a.edges.push(other);}}
    let largest=[],seen=new Uint8Array(nodes.length),componentCount=0;
    for(let i=0;i<nodes.length;i++){if(seen[i])continue;componentCount++;const comp=[],q=[i];seen[i]=1;while(q.length){const n=q.pop();comp.push(n);for(const e of nodes[n].edges)if(!seen[e]){seen[e]=1;q.push(e)}}if(comp.length>largest.length)largest=comp;}
    const coverage=nodes.length?largest.length/nodes.length:0;
    let previewPath=[];
    if(largest.length>1){const start=largest[0],a=nodes[start];let end=start,best=-1;for(const id of largest){const b=nodes[id],d=(a.x-b.x)**2+(a.z-b.z)**2;if(d>best){best=d;end=id}}previewPath=findPath({nodes},start,end);}
    return {schemaVersion:1,nodeCount:nodes.length,componentCount,largestComponent:largest.length,componentCoverage:Number(coverage.toFixed(4)),nodes,previewPath};
  }

  function findPath(graph,startId,endId) {
    const nodes=graph?.nodes||[];if(!nodes[startId]||!nodes[endId])return[];if(startId===endId)return[startId];
    const open=new Set([startId]),came=new Map(),g=new Map([[startId,0]]),f=new Map();
    const heuristic=id=>Math.hypot(nodes[id].x-nodes[endId].x,nodes[id].z-nodes[endId].z);f.set(startId,heuristic(startId));
    let guard=0;
    while(open.size&&guard++<nodes.length*4){let current=null,best=Infinity;for(const id of open){const v=f.get(id)??Infinity;if(v<best){best=v;current=id}}if(current===endId){const path=[current];while(came.has(current)){current=came.get(current);path.push(current)}return path.reverse();}open.delete(current);for(const nb of nodes[current].edges||[]){const cost=Math.hypot(nodes[current].x-nodes[nb].x,nodes[current].z-nodes[nb].z)+Math.abs(nodes[current].y-nodes[nb].y)*.35,t=(g.get(current)??Infinity)+cost;if(t<(g.get(nb)??Infinity)){came.set(nb,current);g.set(nb,t);f.set(nb,t+heuristic(nb));open.add(nb)}}}
    return [];
  }


  function buildTopologyGrammar(world, options={}) {
    const nav=world?.navigation||{},nodes=nav.nodes||[];
    const edgeCount=Math.floor(nodes.reduce((n,x)=>n+(x.edges?.length||0),0)/2);
    const endpoints=[],junctions=[];
    for(const n of nodes){const degree=n.edges?.length||0;if(degree<=2)endpoints.push({...n,degree});if(degree>=5)junctions.push({...n,degree});}
    function pickSpaced(list,max,type,minDistance){const picked=[];for(const n of [...list].sort((a,b)=>b.degree-a.degree||a.id-b.id)){if(picked.every(p=>Math.hypot(p.x-n.x,p.z-n.z)>=minDistance)){picked.push({type,nodeId:n.id,x:n.x,y:n.y,z:n.z,degree:n.degree});if(picked.length>=max)break}}return picked;}
    const plazas=pickSpaced(junctions,Math.max(1,Number(options.maxPlazas??12)|0),'plaza',4.5);
    const gates=pickSpaced(endpoints,Math.max(1,Number(options.maxGates??10)|0),'gate',5.5);
    const componentCount=Math.max(0,Number(nav.componentCount||0));
    const cycleRank=Math.max(0,edgeCount-nodes.length+componentCount);
    const landmarks=[...plazas,...gates];
    for(const l of landmarks){const c=world.cells?.[nodes[l.nodeId]?.cellIndex];if(c)c.landmark=l.type;}
    return {schemaVersion:1,edgeCount,componentCount,endpointCount:endpoints.length,junctionCount:junctions.length,cycleRank,landmarkCount:landmarks.length,landmarks};
  }

  function buildLodLevels(world) {
    const cells=world?.cells||[], medium=[], low=[];
    for(let i=0;i<cells.length;i++){
      const c=cells[i],h=hashString(`${i}:${c.role}:${c.x.toFixed(2)}:${c.z.toFixed(2)}`)%1000;
      const keepMedium=c.role==='tower'||c.role==='road'||h<560;
      const keepLow=c.role==='tower'||(c.role==='road'&&h<720)||(c.role==='wall'&&h<280)||(c.role==='building'&&h<220)||(c.role==='splatter'&&h<80);
      if(keepMedium)medium.push(i);if(keepLow)low.push(i);
    }
    return {schemaVersion:1,fullCount:cells.length,mediumIndices:medium,lowIndices:low,mediumCount:medium.length,lowCount:low.length};
  }

  function worldStats(world) {
    const cells = world?.cells || [];
    let maxHeight = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const roles = {};
    for (const c of cells) {
      maxHeight = Math.max(maxHeight, c.height || 0); minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
      roles[c.role||c.kind||'unknown']=(roles[c.role||c.kind||'unknown']||0)+1;
    }
    return { instances: cells.length, maxHeight, roles, bounds: cells.length ? { minX, maxX, minZ, maxZ } : null };
  }

  function qualityScore(world) {
    const q=world?.quality||{},nav=world?.navigation||{},topology=world?.topology||{},roles=world?.roles||{};
    const diversity=['road','wall','building','tower'].filter(k=>(roles[k]||0)>0).length/4;
    const density=clamp(Number(q.samplingDensity||0)/.22,0,1);
    const navCoverage=clamp(Number(nav.componentCoverage||0),0,1);
    const sizeScore=clamp((Number(world?.instanceCount||0)-64)/1200,0,1);
    const bounded=q.bounded?1:0,silhouette=q.silhouettePreserved?1:0,stroke=world?.stroke?.source==='hanzi-writer-data'?1:.55;
    const topologyScore=clamp((Number(topology.landmarkCount||0)/8)*.7+(Number(topology.cycleRank||0)>0?.3:0),0,1);
    const score=bounded*13+silhouette*13+diversity*16+density*10+navCoverage*20+sizeScore*8+stroke*8+topologyScore*12;
    return Number(clamp(score,0,100).toFixed(2));
  }

  function enrichWorld(world, options={}) {
    world.stroke=assignStrokeOrder(world.cells,options.strokeData,world.sourceWidth,world.sourceHeight);
    world.navigation=buildNavGraph(world,{maxNavNodes:options.maxNavNodes,maxWalkHeight:options.maxWalkHeight,maxStepHeight:options.maxStepHeight});
    world.topology=buildTopologyGrammar(world,{maxPlazas:options.maxPlazas,maxGates:options.maxGates});
    world.lod=buildLodLevels(world);
    world.quality.score=qualityScore(world);
    return world;
  }

  function maskToWorld(mask,width,height,options={}) { return enrichWorld(baseMaskToWorld(mask,width,height,options),options); }

  function tournamentMaskToWorld(mask,width,height,options={}) {
    const count=clamp(Number(options.candidateCount??3)|0,1,5),baseSeed=String(options.seed??'ink-glyph-world'),candidates=[];
    for(let i=0;i<count;i++){
      const variant={...options,seed:i===0?baseSeed:`${baseSeed}:candidate:${i}`,heightPower:Number(options.heightPower??1.15)*(1+(i-1)*.045),scatter:clamp(Number(options.scatter??.035)*(1+(i-1)*.12),0,.25)};
      const world=enrichWorld(baseMaskToWorld(mask,width,height,variant),variant);candidates.push({i,score:world.quality.score,world});
    }
    candidates.sort((a,b)=>b.score-a.score||a.i-b.i);const selected=candidates[0].world;
    selected.tournament={candidateCount:count,selectedIndex:candidates[0].i,scores:candidates.map(c=>({index:c.i,score:c.score})).sort((a,b)=>a.index-b.index)};
    return selected;
  }

  return Object.freeze({
    GENERATOR_VERSION, PRESETS, clamp, hashString, stableStringify, recipeKey, cleanMask, distanceField, sampleMask,
    maskToWorld, tournamentMaskToWorld, assignStrokeOrder, buildNavGraph, findPath, buildTopologyGrammar, buildLodLevels, worldStats, qualityScore
  });
});
