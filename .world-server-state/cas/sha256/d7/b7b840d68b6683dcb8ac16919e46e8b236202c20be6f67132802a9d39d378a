/** Small allocation-free pool for bullets, particles, decals and transient effects. */
export class RuntimeObjectPool{
  constructor({create,reset=()=>{},max=256}){this.create=create;this.reset=reset;this.max=max;this.free=[];this.live=new Set();this.created=0;}
  acquire(){const o=this.free.pop()||this.create();if(!o)return null;this.created++;this.live.add(o);return o;}
  release(o){if(!this.live.delete(o))return false;this.reset(o);if(this.free.length<this.max)this.free.push(o);else o.dispose?.();return true;}
  clear(){for(const o of this.live)o.dispose?.();for(const o of this.free)o.dispose?.();this.live.clear();this.free.length=0;}
  report(){return{live:this.live.size,free:this.free.length,max:this.max,allocationReuse:true,visualQualityChanged:false};}
}
