'use strict';

const DEFAULT_VOXEL_TO_MATTER = Object.freeze({
  0:'air',1:'dirt',2:'dirt',3:'stone',4:'sand',5:'wood',6:'wood',
  7:'snow',8:'water',9:'glass',10:'stone',11:'wood',12:'coal',13:'metal'
});
const DEFAULT_MATTER_TO_VOXEL = Object.freeze({
  dirt:2,stone:3,sand:4,wood:5,snow:7,water:8,glass:9,coal:12,metal:13
});

class PixelCellAdapter {
  constructor(runtime) {
    if (!runtime || runtime.mode !== 'pixel2d') throw new Error('PixelCellAdapter requires pixel2d runtime');
    this.runtime = runtime;
  }
  set(x,y,material,state={}) { return this.runtime.setCell(x,y,0,material,state); }
  get(x,y) { return this.runtime.getCell(x,y,0); }
  clear(x,y) { this.runtime.clearCell(x,y,0); }
  addAnchor(x,y) { this.runtime.addAnchor(x,y,0); }
  explode(x,y,options={}) { return this.runtime.explode({x,y,z:0,...options}); }
  snapshot() {
    return this.runtime.world.snapshot().map(item => {
      const [x,y] = item.position.split(',').map(Number);
      return {x,y,...item};
    });
  }
}

class VoxelCellAdapter {
  constructor(runtime,{
    voxelToMatter=DEFAULT_VOXEL_TO_MATTER,matterToVoxel=DEFAULT_MATTER_TO_VOXEL
  }={}) {
    if (!runtime || runtime.mode !== 'voxel3d') throw new Error('VoxelCellAdapter requires voxel3d runtime');
    this.runtime=runtime; this.voxelToMatter={...voxelToMatter}; this.matterToVoxel={...matterToVoxel};
  }
  set(x,y,z,material,state={}) { return this.runtime.setCell(x,y,z,material,state); }
  get(x,y,z) { return this.runtime.getCell(x,y,z); }
  clear(x,y,z) { this.runtime.clearCell(x,y,z); }
  addAnchor(x,y,z) { this.runtime.addAnchor(x,y,z); }
  explode(x,y,z,options={}) { return this.runtime.explode({x,y,z,...options}); }

  importRegion({min,max,getBlock,maxCells=100000}={}) {
    if (!min || !max || typeof getBlock !== 'function') throw new Error('importRegion requires min/max/getBlock');
    let visited=0,imported=0,unsupported=0;
    const total=(max.x-min.x+1)*(max.y-min.y+1)*(max.z-min.z+1);
    outer: for(let y=min.y;y<=max.y;y++)for(let x=min.x;x<=max.x;x++)for(let z=min.z;z<=max.z;z++){
      if(visited>=maxCells)break outer; visited++;
      const block=getBlock(x,y,z),material=this.voxelToMatter[block];
      if(material===undefined){if(Number(block)!==0)unsupported++;continue;}
      if(material==='air')continue;
      this.runtime.setCell(x,y,z,material);imported++;
    }
    return{visited,imported,unsupported,truncated:visited<total};
  }

  importRows(rows,{
    getBlockId=row=>row.block_type??row.block,
    getPosition=row=>({x:row.x,y:row.y,z:row.z})
  }={}) {
    let imported=0,unsupported=0;
    for(const row of rows||[]){
      const pos=getPosition(row);if(![pos.x,pos.y,pos.z].every(Number.isInteger))continue;
      const material=this.voxelToMatter[getBlockId(row)];
      if(material===undefined){unsupported++;continue;}
      if(material==='air')this.runtime.clearCell(pos.x,pos.y,pos.z);
      else this.runtime.setCell(pos.x,pos.y,pos.z,material);
      imported++;
    }
    return{imported,unsupported};
  }

  exportVoxelState() {
    const voxels=[],dynamicMatter=[];
    this.runtime.world.forEachCell((cell,x,y,z)=>{
      const block=this.matterToVoxel[cell.material];
      if(block===undefined)dynamicMatter.push({x,y,z,cell});else voxels.push({x,y,z,block});
    });
    voxels.sort(positionSort);dynamicMatter.sort(positionSort);
    return{voxels,dynamicMatter};
  }

  changesFromEvents(events) {
    const changes=new Map();
    const record=(x,y,z,before,after)=>{
      const beforeBlock=before==='air'?0:this.matterToVoxel[before];
      const afterBlock=after==='air'?0:this.matterToVoxel[after];
      let block=afterBlock;
      if(afterBlock===undefined&&beforeBlock!==undefined&&beforeBlock!==0)block=0;
      changes.set(`${x},${y},${z}`,{
        x,y,z,block:block===undefined?null:block,
        dynamicMaterial:afterBlock===undefined&&after!=='air'?after:null
      });
    };
    for(const event of events||[]){
      if(event.type==='cell-set'||event.type==='cell-cleared'){
        const {x,y,z}=event.position;record(x,y,z,event.before,event.after);continue;
      }
      if(event.type==='cell-move'){
        record(event.from.x,event.from.y,event.from.z,event.material,'air');
        record(event.to.x,event.to.y,event.to.z,'air',event.material);continue;
      }
      if(event.type==='cell-swap'){
        record(event.first.x,event.first.y,event.first.z,event.a,event.b);
        record(event.second.x,event.second.y,event.second.z,event.b,event.a);
      }
    }
    return Array.from(changes.values()).sort(positionSort);
  }
}

function positionSort(a,b){return a.y-b.y||a.x-b.x||(a.z||0)-(b.z||0);}

module.exports={
  PixelCellAdapter,VoxelCellAdapter,
  DEFAULT_VOXEL_TO_MATTER,DEFAULT_MATTER_TO_VOXEL,positionSort
};
