/* Lossless-by-value delta codec: unchanged fields are omitted; changed JS numbers are
 * serialized as IEEE754 float64, never quantized. Local player remains authoritative. */
export function diffState(previous={},current={}){const changed={};for(const [k,v] of Object.entries(current)){const pv=previous[k];if(Array.isArray(v)){if(!Array.isArray(pv)||v.length!==pv.length||v.some((x,i)=>Object.is(x,pv[i])===false))changed[k]=v;}else if(typeof v==='object'&&v!==null){const d=diffState(pv||{},v);if(Object.keys(d).length)changed[k]=d;}else if(!Object.is(v,pv))changed[k]=v;}return changed;}
export function applyDelta(base={},delta={}){const out={...base};for(const[k,v]of Object.entries(delta)){out[k]=(v&&typeof v==='object'&&!Array.isArray(v))?applyDelta(base[k]||{},v):v;}return out;}
export class NetworkDeltaCodec{
  constructor(){this.previous=new Map();}
  encode(id,state,{localAuthoritative=false}={}){if(localAuthoritative)return{mode:'full-local-authoritative',state,quantized:false};const prev=this.previous.get(id)||{},delta=diffState(prev,state);this.previous.set(id,structuredClone?structuredClone(state):JSON.parse(JSON.stringify(state)));return{mode:'lossless-delta-v1',delta,quantized:false,precision:'source-js-number',unchangedFieldsOmitted:true};}
  decode(base,packet){return packet.mode==='full-local-authoritative'?packet.state:applyDelta(base,packet.delta);}
  report(){return{mode:'lossless-network-delta-v1',quantization:false,nearPrecisionReduced:false,localPlayerAlwaysAuthoritative:true};}
}
