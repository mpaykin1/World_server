'use strict';
function planCpuVerification(changed=[]){
  const set=new Set(['security']);let full=false;
  for(const p0 of changed){const p=String(p0).replace(/\\/g,'/');if(/^docs\/|\.md$/i.test(p)){set.add('docs');continue;}if(/supabase\/migrations|\.sql$/i.test(p)){set.add('migrations');set.add('database');}if(/apps\/.*index\.html|shared\/.*\.js/i.test(p)){set.add('browser');set.add('mobile');set.add('near-field');}if(/server|api\/|lib\/|package(-lock)?\.json/i.test(p)){set.add('unit');set.add('integration');}if(/movement|collision|camera|spawn|physics/i.test(p)){set.add('gameplay');full=true;}if(/quality-autopilot|release|workflow/i.test(p)){set.add('release-gate');full=true;}}
  if(full)set.add('full-suite');else if(!set.has('unit')&&!set.has('browser')&&!set.has('migrations'))set.add('smoke');
  const order=['security','migrations','database','unit','integration','browser','mobile','near-field','gameplay','release-gate','full-suite','smoke','docs'];return {full,steps:order.filter(x=>set.has(x))};
}
module.exports={planCpuVerification};
