'use strict';

const { sendJson, methodNotAllowed, withErrors, httpError } = require('../http');

const { enhanceVoxelWorld } = require('../world-quality-voxel-enhancer');

const MAX_INPUT_BYTES = 58 * 1024;

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { throw httpError(400, 'Некорректный JSON.'); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) {
        reject(httpError(413, 'Serverless voxel input is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(httpError(400, 'Некорректный JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function finiteInt(value, fallback, min, max) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function decodeRgb(body) {
  const width = finiteInt(body.width, 0, 1, 128);
  const height = finiteInt(body.height, 0, 1, 128);
  if (!width || !height) throw httpError(400, 'Некорректный размер изображения.');

  let buf;
  try { buf = Buffer.from(String(body.rgbBase64 || ''), 'base64'); }
  catch { throw httpError(400, 'Некорректные RGB данные.'); }

  if (buf.length !== width * height * 3) {
    throw httpError(400, `RGB length mismatch: ${buf.length} != ${width * height * 3}`);
  }
  return { width, height, buf };
}

function luminance(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function edgeMap(width, height, rgb) {
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    lum[i] = luminance(rgb[i*3], rgb[i*3+1], rgb[i*3+2]);
  }
  const edge = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y*width+x;
    const xl = Math.max(0, x-1), xr = Math.min(width-1, x+1);
    const yu = Math.max(0, y-1), yd = Math.min(height-1, y+1);
    const gx = Math.abs(lum[y*width+xr] - lum[y*width+xl]);
    const gy = Math.abs(lum[yd*width+x] - lum[yu*width+x]);
    edge[i] = Math.min(1, (gx+gy)*1.7);
  }
  return { lum, edge };
}

function solveSkyline(width, height, lum, edge) {
  const minY = Math.max(2, Math.floor(height * 0.035));
  const maxY = Math.min(height-2, Math.floor(height * 0.78));
  const hh = maxY-minY+1;
  const score = Array.from({length: hh}, () => new Float32Array(width));

  // vertical prefix sums for cheap support estimate
  const prefix = Array.from({length: width}, () => new Float32Array(height+1));
  for (let x=0;x<width;x++) {
    for (let y=0;y<height;y++) {
      const i=y*width+x;
      const dark=1-lum[i];
      prefix[x][y+1]=prefix[x][y]+0.55*dark+0.9*edge[i];
    }
  }
  const supportSpan=Math.max(8,Math.floor(height/6));
  for (let yi=0; yi<hh; yi++) {
    const y=minY+yi, y2=Math.min(height,y+supportSpan);
    for (let x=0;x<width;x++) {
      const i=y*width+x;
      const dark=1-lum[i];
      const support=(prefix[x][y2]-prefix[x][y])/Math.max(1,y2-y);
      const yn=y/Math.max(1,height-1);
      score[yi][x]=1.5*edge[i]+0.9*dark+1.5*support+0.18*(1-yn);
    }
  }

  const dp=Array.from({length:hh},()=>new Float32Array(width));
  const prev=Array.from({length:hh},()=>new Int16Array(width));
  for(let yi=0;yi<hh;yi++) dp[yi][0]=score[yi][0];
  const maxJump=Math.max(4,Math.floor(height/12)), smooth=.10;

  for(let x=1;x<width;x++) {
    for(let yi=0;yi<hh;yi++) {
      const lo=Math.max(0,yi-maxJump), hi=Math.min(hh-1,yi+maxJump);
      let best=-1e30,bestJ=yi;
      for(let j=lo;j<=hi;j++) {
        const v=dp[j][x-1]-smooth*Math.abs(j-yi);
        if(v>best){best=v;bestJ=j;}
      }
      dp[yi][x]=score[yi][x]+best;
      prev[yi][x]=bestJ;
    }
  }
  let last=0,best=-1e30;
  for(let yi=0;yi<hh;yi++) if(dp[yi][width-1]>best){best=dp[yi][width-1];last=yi;}
  const path=new Int16Array(width); path[width-1]=last+minY;
  for(let x=width-1;x>0;x--){ last=prev[last][x]; path[x-1]=last+minY; }
  return path;
}

function palette64(width, height, rgb) {
  const sums=Array.from({length:64},()=>[0,0,0,0]);
  const idx=new Uint8Array(width*height);
  for(let i=0;i<width*height;i++) {
    const r=rgb[i*3],g=rgb[i*3+1],b=rgb[i*3+2];
    const bin=((r>>6)<<4)|((g>>6)<<2)|(b>>6);
    idx[i]=bin;
    const s=sums[bin]; s[0]+=r;s[1]+=g;s[2]+=b;s[3]++;
  }
  const palette=new Array(64);
  for(let i=0;i<64;i++) {
    const s=sums[i], rn=(i>>4)&3, gn=(i>>2)&3, bn=i&3;
    const r=s[3]?Math.round(s[0]/s[3]):rn*64+32;
    const g=s[3]?Math.round(s[1]/s[3]):gn*64+32;
    const b=s[3]?Math.round(s[2]/s[3]):bn*64+32;
    palette[i]=(r<<16)|(g<<8)|b;
  }
  return { idx, palette };
}

function generateWorld(body) {
  const {width,height,buf:rgb}=decodeRgb(body);
  const maxDepth=finiteInt(body.maxDepth,32,6,48);
  const maxThickness=finiteInt(body.maxThickness,6,1,8);
  const structureCell=finiteInt(body.structureCell,4,2,10);
  const depthLayers=finiteInt(body.depthLayers,10,3,14);

  const {lum,edge}=edgeMap(width,height,rgb);
  const skyline=solveSkyline(width,height,lum,edge);
  const sky=new Uint8Array(width*height);
  for(let x=0;x<width;x++) for(let y=0;y<skyline[x];y++) sky[y*width+x]=1;

  const {idx:paletteIndex,palette}=palette64(width,height,rgb);
  const tileZ=new Map(),tileT=new Map();

  for(let ty=0;ty<height;ty+=structureCell) for(let tx=0;tx<width;tx+=structureCell) {
    const y2=Math.min(height,ty+structureCell),x2=Math.min(width,tx+structureCell);
    let count=0,sumEdge=0,sumDark=0;
    for(let y=ty;y<y2;y++) for(let x=tx;x<x2;x++) {
      const i=y*width+x;if(sky[i])continue;
      count++;sumEdge+=edge[i];sumDark+=1-lum[i];
    }
    if(!count)continue;
    const yc=(ty+y2-1)*.5,yn=yc/Math.max(1,height-1);
    const perspective=Math.pow(yn,1.55);
    let layer=Math.round(perspective*(depthLayers-1));
    layer=Math.max(0,Math.min(depthLayers-1,layer));
    let baseZ=Math.round(layer*maxDepth/Math.max(1,depthLayers-1));
    baseZ=Math.min(maxDepth,baseZ+Math.round((sumEdge/count)*1.2+(sumDark/count)*.7));
    const thickness=Math.max(1,Math.min(maxThickness,1+Math.round(yn*(maxThickness-1)*.7+(sumEdge/count)*1.2)));
    const key=`${Math.floor(tx/structureCell)},${Math.floor(ty/structureCell)}`;
    tileZ.set(key,baseZ);tileT.set(key,thickness);
  }

  const voxels=[];
  const depths=new Set();
  let visibleReferenceCells=0;
  for(let iy=0;iy<height;iy++){
    const worldY=height-1-iy;
    for(let ix=0;ix<width;ix++){
      const i=iy*width+ix;if(sky[i])continue;
      visibleReferenceCells++;
      const key=`${Math.floor(ix/structureCell)},${Math.floor(iy/structureCell)}`;
      const frontZ=tileZ.get(key)||0,thickness=tileT.get(key)||1;
      depths.add(frontZ);
      for(let dz=0;dz<thickness;dz++)voxels.push([ix,worldY,frontZ-dz,paletteIndex[i]]);
    }
  }

  // Walkable slab, hidden below front projection.
  const groundPalette=paletteIndex[(height-1)*width+Math.floor(width/2)]||0;
  let foundationVoxels=0;
  for(let x=0;x<width;x++)for(let z=-maxThickness;z<=maxDepth;z++){
    voxels.push([x,-1,z,groundPalette]);foundationVoxels++;
  }

  let top=[0,0,0], horizon=[0,0,0], tc=0,hc=0;
  const topRows=Math.max(1,Math.floor(height/10));
  for(let y=0;y<topRows;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3;top[0]+=rgb[i];top[1]+=rgb[i+1];top[2]+=rgb[i+2];tc++;
  }
  const sorted=[...skyline].sort((a,b)=>a-b),hy=sorted[Math.floor(sorted.length/2)]||Math.floor(height*.4);
  for(let y=Math.max(0,hy-2);y<=Math.min(height-1,hy+2);y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*3;horizon[0]+=rgb[i];horizon[1]+=rgb[i+1];horizon[2]+=rgb[i+2];hc++;
  }
  top=top.map(v=>Math.round(v/Math.max(1,tc)));horizon=horizon.map(v=>Math.round(v/Math.max(1,hc)));

  return {
    schema:'ai3d-voxel-city-serverless-v1',
    generator:'World_server Vercel serverless voxel fallback',
    source:{width,height,gridWidth:width,gridHeight:height},
    voxelSize:1,
    palette,
    voxels,
    performance:{
      chunkSize:16,
      logicalRepresentation:'cubes',
      browserMeshing:'chunked_greedy_surface',
      internalFaceCulling:true,
      bakedLighting:'static_face_vertex_colors',
      dynamicShadows:false,
      farLod:'chunk_aabb_hlod',
      streaming:'camera_or_player_centered',
      adaptiveResolution:true,
      farWorldHaze:true
    },
    camera:{
      target:[(width-1)/2,(height-1)/2,maxDepth*.45],
      frontOrtho:{width:width+4,height:height+4,z:maxDepth+Math.max(width,height)},
      perspectiveFov:42
    },
    background:{top,horizon,type:'reference_gradient'},
    claims:{
      frontVoxelShellDerivedFromReference:true,
      depthIsHeuristic:true,
      depthSource:'heuristic_perspective_serverless',
      image3dCorrespondence:'UNTESTED',
      note:'Emergency Vercel fallback: server builds voxel occupancy from browser-downsampled RGB. No external AI3D_WORKER_URL required.'
    },
    stats:{
      logicalVoxels:voxels.length,
      foundationVoxels,
      visibleReferenceCells,
      skyCells:sky.reduce((a,b)=>a+b,0),
      frontDepthLayersUsed:depths.size
    }
  };
}

module.exports = withErrors(async (req,res)=>{
  if(req.method!=='POST')return methodNotAllowed(res,['POST']);
  const body=await readBody(req);
  const world=enhanceVoxelWorld(generateWorld(body),{rootDir:process.cwd(),enabled:body.qualityAutopilot!==false,seed:Number(body.qualitySeed)||undefined});
  sendJson(res,200,{ok:true,engine:'vercel_serverless_voxel_fallback',world});
});

module.exports._private={decodeRgb,edgeMap,solveSkyline,palette64,generateWorld};
