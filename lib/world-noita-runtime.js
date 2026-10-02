'use strict';

const { MatterWorld, MATERIALS, key } = require('./world-matter-engine');
const { DenseMatterGrid } = require('./world-matter-dense-grid');
const { RigidClusterSystem } = require('./world-matter-structure');
const { MatterCamera } = require('./world-matter-camera');
const { MatterParticleSystem } = require('./world-matter-particles');

class NoitaRuntime {
  constructor(options = {}) {
    this.sparse = options.sparse || new MatterWorld({ seed: options.seed || 1 });
    this.dense = options.dense || new DenseMatterGrid(
      options.width || 256, options.height || 144, { seed: options.seed || 1 }
    );
    this.rigid = options.rigid || new RigidClusterSystem(options.rigidOptions);
    this.rigidMask=new Set();
    this.dense.setExternalSolid((x,y)=>{
      if(this.rigidMask.has(key(x,y,0)))return true;
      const cell=this.sparse.cells.get(key(x,y,0));
      return Boolean(cell&&MATERIALS[cell.material]?.phase==='solid');
    });
    this.camera = options.camera || new MatterCamera(options.cameraOptions);
    this.particles = options.particles || new MatterParticleSystem({
      seed: options.seed || 1, max: options.maxParticles || 1800
    });
    this.time = 0;
    this.lastEvents = [];
    this.autoStructural=options.autoStructural!==false;
    this.structureInterval=Math.max(1,Number(options.structureInterval)||6);
    this.structureMinCells=Math.max(1,Number(options.structureMinCells)||2);
  }

  _crossLayerChemistry() {
    const hotIds = new Set(['fire','lava']);
    for (const [position,cell] of this.sparse.cells) {
      const def=MATERIALS[cell.material];
      if(!def?.ignition)continue;
      const [x,y,z]=position.split(',').map(Number);
      if(z!==0)continue;
      let hot=false;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const denseCell=this.dense.get(x+dx,y+dy);
        if(denseCell&&hotIds.has(denseCell.material)){hot=true;break;}
      }
      if(!hot)continue;
      if(!cell.burning)this.sparse._emit?.('ignite',{material:cell.material,at:[x,y,z],source:'dense'});
      this.sparse.setCell(x,y,z,cell.material,{
        ...cell,burning:true,temperature:Math.max(cell.temperature||20,def.ignition+120)
      });
    }
  }

  _collectEvents() {
    const events = [
      ...this.sparse.drainEvents(),
      ...this.dense.drainEvents()
    ];
    this.particles.consume(events);
    for (const e of events) {
      if (e.type === 'reaction') this.camera.shake(.8,.16);
      if (e.type === 'fracture') this.camera.shake(.45,.12);
      if (e.type === 'cluster-shatter') this.camera.shake(1.1,.22);
    }
    this.lastEvents = events;
    return events;
  }

  step(dt = 1/60, options = {}) {
    this._crossLayerChemistry();
    const sparse = this.sparse.step({
      maxCells: options.maxSparseCells || 50000
    });
    const dense = this.dense.step({
      maxCells: options.maxDenseCells || 80000
    });
    if(this.autoStructural&&this.sparse.tick%this.structureInterval===0){
      this.rigid.detach(this.sparse,{minCells:this.structureMinCells});
    }
    this.rigid.step(this.sparse,dt,(x,y,z)=>{
      if(z!==0)return false;
      const cell=this.dense.get(x,y);
      const phase=cell&&MATERIALS[cell.material]?.phase;
      return phase==='solid'||phase==='powder';
    });
    this.rigidMask=new Set();
    for(const cluster of this.rigid.renderSnapshot()){
      for(const cell of cluster.cells)this.rigidMask.add(key(cell.x,cell.y,cell.z));
    }
    const events = this._collectEvents();
    this.particles.ambientFromMatter(
      this.dense, options.ambientParticleBudget ?? 8
    );
    this.particles.step(dt);
    this.camera.update(dt);
    this.time += dt;
    return {
      time: this.time,
      sparse,
      dense,
      rigid: this.rigid.clusters.length,
      particles: this.particles.stats(),
      events: events.length
    };
  }

  renderSources() {
    return [this.dense, this.sparse];
  }

  detachUnsupported(options = {}) {
    const result = this.rigid.detach(this.sparse, options);
    this._collectEvents();
    return result;
  }

  cutTo(x,y,zoom) { this.camera.cutTo(x,y,zoom); }
  animateCamera(x,y,zoom) { this.camera.animateTo(x,y,zoom); }

  stats() {
    return {
      time:this.time,
      sparse:this.sparse.stats(),
      dense:this.dense.stats(),
      rigid:this.rigid.clusters.length,
      particles:this.particles.stats(),
      camera:{
        x:this.camera.x,y:this.camera.y,
        zoom:this.camera.zoom,cellPixels:this.camera.cellPixels()
      }
    };
  }
}

module.exports = { NoitaRuntime };
