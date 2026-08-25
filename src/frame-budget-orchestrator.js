export class FrameBudgetOrchestrator{
  constructor({backgroundBudgetMs=2.5}={}){this.backgroundBudgetMs=backgroundBudgetMs;this.queue=[];this.stats={executed:0,deferred:0};}
  enqueue(fn,{priority=0,nearCritical=false,label='task'}={}){this.queue.push({fn,priority,nearCritical,label});this.queue.sort((a,b)=>Number(b.nearCritical)-Number(a.nearCritical)||b.priority-a.priority);}
  async drain(){const start=performance.now();this.stats={executed:0,deferred:0};const keep=[];for(const t of this.queue){if(!t.nearCritical&&performance.now()-start>=this.backgroundBudgetMs){keep.push(t);this.stats.deferred++;continue;}await t.fn();this.stats.executed++;}this.queue=keep;return this.report();}
  report(){return{mode:'non-destructive-frame-budget-orchestrator-v1',queued:this.queue.length,...this.stats,nearCriticalNeverDeferred:true,qualityKnobsTouched:false};}
}
