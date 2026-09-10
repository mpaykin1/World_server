'use strict';
(async()=>{
  const id=(new URLSearchParams(location.search).get('world')||'').trim();
  const frame=document.getElementById('worldFrame');
  const status=document.getElementById('status');
  const allowedKinds=new Set(['game','navigator','hub','experiment','experience']);
  try{
    let inventory=[];
    try{
      const r=await fetch('/api/apps?all=1',{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      inventory=(await r.json()).inventory||[];
    }catch{
      const r=await fetch('/shared/world-catalog-fallback.json',{cache:'no-store'});
      if(!r.ok)throw new Error(`fallback HTTP ${r.status}`);
      inventory=(await r.json()).inventory||[];
    }
    const item=inventory.find(x=>x.id===id&&x.external===true&&allowedKinds.has(x.kind||'game'));
    if(!item)throw new Error('Мир не найден в каноническом каталоге');
    const target=new URL(item.url);
    if(!/^https?:$/.test(target.protocol))throw new Error('Недопустимый адрес мира');
    document.title=`World Server — ${item.title}`;
    frame.title=item.title;
    frame.addEventListener('load',()=>{
      status.textContent=`${item.title} · технологии World Server активны`;
      const signatures={'dark-void-navigator-live':'lens','improve-world-home-live':'rain','improve-world-experiment-100':'lightning','voxel-gothic-steampunk-world':'gust','gothic-voxel-city-atlas-v3-mobile-final':'rain','voxel-gothic-steampunk-mobile-repaired':'gust','world-server-codex-voxel-v3':'impact','world-server-catalog-live':'orbit'};
      setTimeout(()=>window.WorldCapabilities?.trigger(signatures[id]||'rain',{duration:5200,power:.82}),250);
    },{once:true});
    frame.src=target.href;
  }catch(error){status.textContent=`Не удалось открыть мир: ${error.message}`;frame.remove();}
})();
