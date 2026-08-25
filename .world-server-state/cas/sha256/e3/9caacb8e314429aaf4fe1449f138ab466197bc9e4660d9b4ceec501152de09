/* Residency only. It never resamples or recompresses source pages. Near-field pages
 * are pinned at source resolution; if a page is absent, renderer keeps the full source
 * texture rather than substituting a lower-quality approximation. */
export class VirtualTextureResidency{
  constructor({nearRadius=42,maxResidentPages=2048}={}){this.nearRadius=nearRadius;this.maxResidentPages=maxResidentPages;this.pages=new Map();this.frame=0;}
  register(page){if(!page?.id)throw new Error('virtual texture page id required');if(page.scale&&page.scale!==1)throw new Error('lossy virtual texture page scale forbidden');this.pages.set(page.id,{...page,resident:false,pinned:false,lastUsed:0});}
  touch(pageId,{distance=Infinity,visible=true}={}){const p=this.pages.get(pageId);if(!p)return {fallback:'full-source-texture'};p.lastUsed=++this.frame;p.pinned=distance<=this.nearRadius;p.resident=true;p.visible=visible;this._evict();return{resident:true,pinned:p.pinned,sourceResolution:true};}
  _evict(){const resident=[...this.pages.values()].filter(p=>p.resident);if(resident.length<=this.maxResidentPages)return;for(const p of resident.filter(p=>!p.pinned&&!p.visible).sort((a,b)=>a.lastUsed-b.lastUsed)){p.resident=false;if(--resident.length<=this.maxResidentPages)break;}}
  report(){const a=[...this.pages.values()];return{mode:'full-resolution-virtual-texture-residency-v1',registered:a.length,resident:a.filter(x=>x.resident).length,pinnedNear:a.filter(x=>x.pinned).length,nearRadius:this.nearRadius,sourceTextureDownscale:false,sourceTextureRecompression:false,missingPageFallback:'full-source-texture'};}
}
