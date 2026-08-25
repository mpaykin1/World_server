'use strict';
function evaluateMemoryPressure(samples=[],options={}){
  if(!samples.length)return {ok:false,status:'HOLD',reason:'no-memory-samples'};
  const maxRssRatio=Number(options.maxRssRatio??.82),maxHeapRatio=Number(options.maxHeapRatio??.9),maxGrowthBytes=Number(options.maxGrowthBytes??256*1024*1024);
  const last=samples.at(-1),first=samples[0];const rssRatio=last.totalMemory?last.rss/last.totalMemory:0,heapRatio=last.heapTotal?last.heapUsed/last.heapTotal:0,growth=last.rss-first.rss;
  const findings=[];if(rssRatio>maxRssRatio)findings.push('rss-pressure');if(heapRatio>maxHeapRatio)findings.push('heap-pressure');if(samples.length>=3&&growth>maxGrowthBytes)findings.push('rss-growth');
  return {ok:findings.length===0,status:findings.length?'HOLD':'PASS',rssRatio,heapRatio,growth,findings};
}
module.exports={evaluateMemoryPressure};
