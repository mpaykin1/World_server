'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {comparePerceptual,measurePerceptualFeatures}=require('../lib/reference-perceptual-fidelity');
function img(w,h,bg=[240,240,240],fg=[40,50,60],box=[2,2,6,6]){const p=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=x>=box[0]&&x<box[2]&&y>=box[1]&&y<box[3]?fg:bg,o=(y*w+x)*4;p[o]=c[0];p[o+1]=c[1];p[o+2]=c[2];p[o+3]=255;}return{width:w,height:h,pixels:p};}
test('identical visual grammar scores one',()=>{const a=img(8,8);const q=comparePerceptual(a,a);assert.equal(q.score,1);assert.equal(q.compositionFidelity,1);assert.equal(q.paletteFidelity,1);});
test('composition and palette are measured separately from pixel identity',()=>{const ref=img(8,8),sameShape=img(16,16,[240,240,240],[120,70,50],[4,4,12,12]);const q=comparePerceptual(ref,sameShape);assert.ok(q.compositionFidelity>.9);assert.ok(q.paletteFidelity<1);assert.ok(q.score>0&&q.score<1);});
test('feature extractor exposes light detail and foreground structure',()=>{const f=measurePerceptualFeatures(img(12,10));for(const k of ['lumaMean','lumaStd','saturation','edgeDensity','foregroundCoverage','centerX','centerY'])assert.equal(typeof f[k],'number');assert.equal(f.histogram.length,64);});

test('downsampled checkerboard preserves nonzero edge density',()=>{
  const w=64,h=64,p=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=((Math.floor(x/8)+Math.floor(y/8))%2)?255:0,o=(y*w+x)*4;p[o]=p[o+1]=p[o+2]=v;p[o+3]=255;}
  const f=measurePerceptualFeatures({width:w,height:h,pixels:p},{maxSide:16});
  assert.ok(f.edgeDensity>0.1);
});
