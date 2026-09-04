'use strict';
const asset=require('./asset-runtime');
const {createRuntimeOptimizer,paritySignature}=require('./runtime-optimizer');
class CreatureRuntime{
 constructor(options={}){this.optimizer=createRuntimeOptimizer(options);this.identityCache=new WeakMap();this.scheduler=new asset.AnimationScheduler({maxPerFrame:this.optimizer.controller.snapshot().animationBudget});this.frames=0;}
 _structuralKey(a){if(!a||typeof a!=='object')return null;if(a.cacheKey)return 'explicit:'+String(a.cacheKey);if(a.object||a.source)return null;const v={format:a.format,category:a.category,name:a.name||null,seed:a.seed??a.params?.seed??null,params:a.params||{},materialSettings:a.materialSettings||{},controls:a.controls||{}};return JSON.stringify(v);}
 recipe(input){if(input&&input.schemaVersion==='creature-recipe-v1'&&input.hash)return input;if(input&&typeof input==='object'){const hit=this.identityCache.get(input);if(hit){this.optimizer.telemetry.inc('recipeIdentityHits');return hit;}const key=this._structuralKey(input);if(key){const cached=this.optimizer.recipeCache.get(key);if(cached){this.identityCache.set(input,cached);this.optimizer.telemetry.inc('recipeLruHits');return cached;}}const recipe=asset.buildRecipe(input);this.identityCache.set(input,recipe);if(key)this.optimizer.recipeCache.set(key,recipe);this.optimizer.telemetry.inc('recipeBuilds');return recipe;}return asset.buildRecipe(input);}
 observeFrame(frameTimeMs){this.frames++;this.optimizer.telemetry.observeFrame(frameTimeMs);const budget=this.optimizer.controller.observe(frameTimeMs);this.scheduler.maxPerFrame=budget.animationBudget;return budget;}
 plan(input,ctx={}){const recipe=this.recipe(input);const pressure=this.optimizer.controller.snapshot().pressure;const quality=asset.planCreatureQuality({...ctx,cpuPressure:Math.max(Number(ctx.cpuPressure)||0,pressure)});this.optimizer.telemetry.inc('planned');this.optimizer.telemetry.inc('tier:'+quality.tier);if(quality.sleep)this.optimizer.telemetry.inc('sleeping');if(quality.useImpostor)this.optimizer.telemetry.inc('impostors');return{recipe,quality,instancingKey:asset.instancingKey(recipe,quality.tier)};}
 scheduleAnimations(ids){const batch=this.scheduler.schedule(ids);this.optimizer.telemetry.inc('animationScheduled',batch.length);return batch;}
 parity(input,ctx={},transform={},animationState=''){const p=this.plan(input,ctx);return paritySignature({recipe:p.recipe,lodPlan:p.quality,transform,animationState});}
 snapshot(){return{schemaVersion:'creature-runtime-v8',frames:this.frames,...this.optimizer.snapshot()};}
}
function createCreatureRuntime(options){return new CreatureRuntime(options);}
module.exports={CreatureRuntime,createCreatureRuntime};
