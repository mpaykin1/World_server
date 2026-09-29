#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { loadRegistry, saveRegistry, upsertItem } = require('../lib/pixel-panorama-registry.cjs');

function parseArgs(argv) {
  const out = {
    input: '', slug: '', title: '', description: '', fps: 8,
    mobileWidth: 1024, desktopWidth: 2048, hqWidth: 8192,
    tileSize: 512, publicBase: '/shared/panorama360', outputRoot: 'shared/panorama360',
    registry: 'data/pixel-panorama-registry.json', maxFrames: 240
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--input') out.input = argv[++i];
    else if (a === '--slug') out.slug = argv[++i];
    else if (a === '--title') out.title = argv[++i];
    else if (a === '--description') out.description = argv[++i];
    else if (a === '--fps') out.fps = Number(argv[++i]);
    else if (a === '--mobile-width') out.mobileWidth = Number(argv[++i]);
    else if (a === '--desktop-width') out.desktopWidth = Number(argv[++i]);
    else if (a === '--hq-width') out.hqWidth = Number(argv[++i]);
    else if (a === '--tile-size') out.tileSize = Number(argv[++i]);
    else if (a === '--public-base') out.publicBase = argv[++i];
    else if (a === '--output-root') out.outputRoot = argv[++i];
    else if (a === '--registry') out.registry = argv[++i];
    else if (a === '--max-frames') out.maxFrames = Number(argv[++i]);
  }
  return out;
}

function slugify(v) { return String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'pixel-panorama'; }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function listFrames(dir) { return fs.readdirSync(dir).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map((n)=>path.join(dir,n)); }
function commandExists(cmd, args=['-version']) { try { cp.execFileSync(cmd,args,{stdio:'ignore'}); return true; } catch { return false; } }
function run(cmd,args) { return cp.execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
function publicJoin(...parts) { return parts.join('/').replace(/\/+/g,'/').replace(':/','://'); }
function mimeFor(file) { const ext=path.extname(file).toLowerCase(); return ext==='.png'?'image/png':ext==='.webm'?'video/webm':ext==='.mp4'?'video/mp4':ext==='.json'?'application/json':'application/octet-stream'; }

async function getSharp() {
  try { return require('sharp'); } catch { return null; }
}

async function metadata(file, sharp) {
  if (sharp) {
    const m = await sharp(file, { animated: false }).metadata();
    return { width: Number(m.width), height: Number(m.height) };
  }
  if (!commandExists('magick')) throw new Error('sharp or ImageMagick is required');
  const [w,h]=run('magick',['identify','-format','%w %h',file]).split(/\s+/).map(Number);
  return { width:w, height:h };
}

async function resizeNearest(src, dst, width, sharp) {
  const height = Math.round(width / 2);
  ensureDir(path.dirname(dst));
  if (sharp) {
    await sharp(src).resize(width,height,{kernel:'nearest',fit:'fill'}).png({compressionLevel:9,palette:true}).toFile(dst);
    return;
  }
  run('magick',[src,'-filter','point','-resize',`${width}x${height}!`,dst]);
}

async function buildTiles(src, frameNumber, levels, tileSize, outRoot, publicBase, slug, sharp) {
  if (!sharp) return [];
  const levelMeta=[];
  for (const width of levels) {
    const height=Math.round(width/2);
    const resized=await sharp(src).resize(width,height,{kernel:'nearest',fit:'fill'}).png({compressionLevel:4}).toBuffer();
    const cols=Math.ceil(width/tileSize), rows=Math.ceil(height/tileSize);
    const frameDir=path.join(outRoot,'tiles',String(width),`f${String(frameNumber).padStart(6,'0')}`);
    ensureDir(frameDir);
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
      const left=x*tileSize, top=y*tileSize;
      const w=Math.min(tileSize,width-left), h=Math.min(tileSize,height-top);
      const out=path.join(frameDir,`${x}_${y}.png`);
      await sharp(resized).extract({left,top,width:w,height:h}).png({compressionLevel:9,palette:true}).toFile(out);
    }
    levelMeta.push({width,height,cols,rows,tileSize,template:publicJoin(publicBase,slug,'tiles',String(width),`f{frame}`,`{x}_{y}.png`)});
  }
  return levelMeta;
}

function encodeVideo(frameDir,fps,width) {
  if (!commandExists('ffmpeg')) return null;
  const input=path.join(frameDir,'%06d.png');
  const mp4=path.join(frameDir,'loop.mp4');
  const webm=path.join(frameDir,'loop.webm');
  const apng=path.join(frameDir,'loop.apng');
  const vf=`scale=${width}:${Math.round(width/2)}:flags=neighbor`;
  run('ffmpeg',['-y','-framerate',String(fps),'-i',input,'-vf',vf,'-pix_fmt','yuv420p','-movflags','+faststart',mp4]);
  try { run('ffmpeg',['-y','-framerate',String(fps),'-i',input,'-vf',vf,'-c:v','libvpx-vp9','-lossless','1',webm]); } catch {}
  try { run('ffmpeg',['-y','-framerate',String(fps),'-i',input,'-plays','0',apng]); } catch {}
  return {mp4,webm:fs.existsSync(webm)?webm:null,apng:fs.existsSync(apng)?apng:null};
}

function readHotspots(inputDir,publicBase,slug) {
  const candidates=[path.join(inputDir,'hotspots.json'),path.join(path.dirname(inputDir),'hotspots.json')];
  const file=candidates.find(fs.existsSync);
  if(!file) return [];
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(data)) return [];
  return data.map((it)=>({...it,targetManifest:it.targetSlug?publicJoin(publicBase,it.targetSlug,'manifest.json'):it.targetManifest}));
}

function multiresLevels(originalWidth, mobileWidth, desktopWidth, hqWidth) {
  const max=Math.min(originalWidth,hqWidth);
  const vals=new Set();
  let w=Math.max(512, Math.min(mobileWidth, max));
  while(w<max){ vals.add(w); w*=2; }
  vals.add(max);
  vals.add(Math.min(desktopWidth,max));
  return [...vals].filter((v)=>v>=512 && v<=max).sort((a,b)=>a-b);
}

async function main() {
  const args=parseArgs(process.argv);
  if(!args.input) throw new Error('--input required');
  const root=process.cwd();
  const inputDir=path.resolve(root,args.input);
  if(!fs.existsSync(inputDir)||!fs.statSync(inputDir).isDirectory()) throw new Error('input must be a frame directory');
  const frames=listFrames(inputDir);
  if(!frames.length) throw new Error('no frames found');
  if(frames.length>args.maxFrames) throw new Error(`too many frames (${frames.length} > ${args.maxFrames})`);
  const sharp=await getSharp();
  const first=await metadata(frames[0],sharp);
  if(first.width!==first.height*2) throw new Error(`source must be 2:1 equirectangular, got ${first.width}x${first.height}`);
  const slug=slugify(args.slug||path.basename(path.dirname(inputDir))||path.basename(inputDir));
  const title=args.title||slug;
  const outRoot=path.resolve(root,args.outputRoot,slug);
  fs.rmSync(outRoot,{recursive:true,force:true}); ensureDir(outRoot);

  const tiers=[];
  for(const [key,requested] of [['mobile',args.mobileWidth],['desktop',args.desktopWidth]]) {
    const width=Math.min(requested,first.width); tiers.push({key,width});
  }
  if(first.width>args.desktopWidth) tiers.push({key:'hq',width:Math.min(args.hqWidth,first.width)});
  const manifest={type:'pixel-panorama-360',schemaVersion:'4.0.0',slug,title,description:args.description,fps:args.fps,loop:true,createdAt:new Date().toISOString(),source:{width:first.width,height:first.height,frameCount:frames.length},hotspots:readHotspots(inputDir,args.publicBase,slug)};

  for(const tier of tiers) {
    const dir=path.join(outRoot,tier.key); ensureDir(dir); const urls=[];
    for(let i=0;i<frames.length;i++) {
      const out=path.join(dir,`${String(i+1).padStart(6,'0')}.png`);
      await resizeNearest(frames[i],out,tier.width,sharp);
      urls.push(publicJoin(args.publicBase,slug,tier.key,path.basename(out)));
    }
    fs.copyFileSync(path.join(dir,'000001.png'),path.join(dir,'preview.png'));
    const vids=encodeVideo(dir,args.fps,tier.width);
    manifest[tier.key]={width:tier.width,height:Math.round(tier.width/2),frameCount:frames.length,frames:urls,previewUrl:publicJoin(args.publicBase,slug,tier.key,'preview.png'),mp4Url:vids?publicJoin(args.publicBase,slug,tier.key,'loop.mp4'):null,webmUrl:vids?.webm?publicJoin(args.publicBase,slug,tier.key,'loop.webm'):null,apngUrl:vids?.apng?publicJoin(args.publicBase,slug,tier.key,'loop.apng'):null};
  }

  if(sharp) {
    const levels=multiresLevels(first.width,args.mobileWidth,args.desktopWidth,args.hqWidth);
    let commonMeta=null;
    for(let i=0;i<frames.length;i++) {
      const meta=await buildTiles(frames[i],i+1,levels,args.tileSize,outRoot,args.publicBase,slug,sharp);
      if(!commonMeta) commonMeta=meta;
    }
    manifest.multires={tileSize:args.tileSize,frameCount:frames.length,levels:commonMeta||[]};
  } else {
    manifest.multires={disabled:true,reason:'sharp not installed'};
  }

  manifest.previewUrl=manifest.desktop?.previewUrl||manifest.mobile?.previewUrl||'';
  const manifestFile=path.join(outRoot,'manifest.json');
  fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n','utf8');
  const registryPath=path.resolve(root,args.registry); const registry=loadRegistry(registryPath);
  upsertItem(registry,{slug,title,description:args.description,manifestUrl:publicJoin(args.publicBase,slug,'manifest.json'),previewUrl:manifest.previewUrl,frameCount:frames.length,fps:args.fps,qualityTiers:tiers.map(t=>t.key),multires:!!manifest.multires?.levels?.length});
  saveRegistry(registryPath,registry);
  console.log(JSON.stringify({ok:true,engine:sharp?'sharp/libvips':'ImageMagick fallback',slug,manifest:manifestFile,frames:frames.length,tiers:tiers.map(t=>t.key),multiresLevels:manifest.multires?.levels?.map(l=>l.width)||[]},null,2));
}
main().catch((e)=>{console.error(e.stack||e.message);process.exit(1);});
