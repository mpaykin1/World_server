/** Original deterministic RGBA texture atlas. Pure CPU, no external image assets. */
const PALETTES=Object.freeze({
  basalt:[[32,35,41],[57,59,65],[84,79,83],[110,102,101]],
  stone:[[73,76,80],[103,108,111],[134,135,130],[165,163,153]],
  wood:[[71,45,30],[106,69,42],[146,101,61],[179,135,88]],
  grass:[[36,78,33],[59,111,41],[89,141,54],[134,166,78]],
  lava:[[90,18,8],[196,38,9],[255,109,17],[255,203,65]]
});
function hash(x,y,seed){let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^seed)|0;
 n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;}
export function createProceduralAtlas({tileSize=16,seed=1,materials=['basalt','stone','wood','grass','lava']}={}) {
 if(!Number.isSafeInteger(tileSize)||tileSize<4||tileSize>128||!Number.isSafeInteger(seed))
   throw new RangeError('tileSize/seed');
 if(!Array.isArray(materials)||!materials.length||materials.length>32||
   materials.some(name=>!Object.hasOwn(PALETTES,name))) throw new TypeError('materials');
 const columns=Math.ceil(Math.sqrt(materials.length)),rows=Math.ceil(materials.length/columns);
 const width=columns*tileSize,height=rows*tileSize,pixels=new Uint8ClampedArray(width*height*4);
 const tiles={};
 for(let i=0;i<materials.length;i++){
   const name=materials[i],tx=i%columns,ty=Math.floor(i/columns);
   if(tiles[name]) throw new TypeError('duplicate material');
   tiles[name]={x:tx*tileSize,y:ty*tileSize,width:tileSize,height:tileSize};
   const palette=PALETTES[name];
   for(let y=0;y<tileSize;y++)for(let x=0;x<tileSize;x++){
     const n=hash(x+tx*8191,y+ty*4093,seed),grain=name==='wood'?Math.floor(x/3)%4:
       name==='lava'?((x*7+y*11+(n&7))%13<4?3:(n>>>8)%3):n%4;
     const rgb=palette[grain],offset=((ty*tileSize+y)*width+tx*tileSize+x)*4;
     pixels[offset]=rgb[0];pixels[offset+1]=rgb[1];pixels[offset+2]=rgb[2];pixels[offset+3]=255;
   }
 }
 return {width,height,pixels,tiles,materials:[...materials],colorSpace:'srgb'};
}
