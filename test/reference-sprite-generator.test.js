'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {generateSpriteFrame,generateSpriteAtlas}=require('../lib/reference-sprite-generator');

const knight={
  width:24,height:32,palette:[0xc9b27a,0x55424c,0x8c8f98],
  outline:'strong',shadingBands:3,
  parts:[
    {shape:'ellipse',x:.34,y:.08,w:.32,h:.24,colorIndex:0},
    {shape:'rect',x:.28,y:.3,w:.44,h:.42,colorIndex:2},
    {shape:'rect',x:.2,y:.34,w:.12,h:.35,colorIndex:1},
    {shape:'rect',x:.68,y:.34,w:.12,h:.35,colorIndex:1},
    {shape:'rect',x:.32,y:.7,w:.14,h:.24,colorIndex:1},
    {shape:'rect',x:.54,y:.7,w:.14,h:.24,colorIndex:1}
  ]
};

test('semantic sprite generator creates opaque shaded outlined character pixels',()=>{
  const frame=generateSpriteFrame(knight);
  assert.equal(frame.width,24);assert.equal(frame.height,32);
  let opaque=0,colors=new Set();
  for(let i=0;i<frame.pixels.length;i+=4){
    if(frame.pixels[i+3]){opaque++;colors.add(`${frame.pixels[i]},${frame.pixels[i+1]},${frame.pixels[i+2]}`);}
  }
  assert(opaque>120);
  assert(colors.size>=4);
});

test('sprite atlas keeps deterministic frame dimensions and pose count',()=>{
  const atlas=generateSpriteAtlas(knight,[{},{
    parts:knight.parts.map((p,i)=>i===2?{...p,x:.12,y:.28}:p)
  }]);
  assert.equal(atlas.frames,2);
  assert.equal(atlas.frameWidth,24);
  assert.equal(atlas.width,48);
  assert.equal(atlas.height,32);
});
