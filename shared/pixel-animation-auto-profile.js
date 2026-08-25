(function (root, factory) {
  'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationAutoProfile=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='2.0.0';
  const RULES=[
    ['bird',['bird','phoenix','firebird','жар-птиц','ворон','raven','eagle','wing']],
    ['character',['character','hero','player','npc','person','human','персонаж','герой']],
    ['monster',['monster','enemy','creature','zombie','skeleton','монстр','враг']],
    ['fire',['fire','flame','torch','lava','ember','огонь','пламя','факел']],
    ['smoke',['smoke','fog','steam','cloud','дым','туман','пар']],
    ['water',['water','river','sea','ocean','pool','вода','река','море']],
    ['tree',['tree','branch','дерев','ветк']],
    ['grass',['grass','reed','flower','куст','трава','цвет']],
    ['foliage',['leaf','leaves','foliage','листв','лист']],
    ['cloth',['cloth','cape','curtain','banner','fabric','ткан','плащ','занавес']],
    ['flag',['flag','знам','флаг']],
    ['vehicle',['vehicle','locomotive','car','ship','train','boat','truck','машин','локомотив','кораб','поезд']],
    ['weapon',['weapon','sword','gun','rifle','bow','оруж','меч','пистолет','лук']],
    ['machine',['machine','gear','engine','fan','mechanism','механ','шестер']],
    ['portal',['portal','magic','spell','rift','портал','маг']],
    ['light',['light','lamp','neon','glow','фонар','свет','неон']],
    ['glass',['glass','stained','window','gem','crystal','витраж','стек','кристалл']],
  ];
  function textOf(asset){const a=asset||{};return [a.key,a.name,a.path,a.type,...(Array.isArray(a.tags)?a.tags:[])].filter(Boolean).join(' ').toLowerCase();}
  function resolve(asset,fallback='generic'){
    if(asset&&asset.profile)return asset.profile;
    const text=textOf(asset);
    let best=fallback,bestScore=0,bestIndex=RULES.length;
    for(let i=0;i<RULES.length;i+=1){
      const [profile,words]=RULES[i];
      let score=0;
      for(const word of words){
        if(!text.includes(word))continue;
        score+=1;
        if(word===profile)score+=3;
        if(word.length>=7)score+=0.5;
      }
      if(score>bestScore||(score===bestScore&&score>0&&i<bestIndex)){best=profile;bestScore=score;bestIndex=i;}
    }
    return best;
  }
  function annotate(items,fallback){return (items||[]).map(item=>({...item,profile:resolve(item,fallback)}));}
  return Object.freeze({VERSION,RULES,resolve,annotate});
});
