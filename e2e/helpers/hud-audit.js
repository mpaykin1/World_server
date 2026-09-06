// Measure painted UI, including children of transparent fixed touch surfaces.
function auditHud(){
 const vp=innerWidth*innerHeight,issues=[],persistent=[];
 const alpha=color=>!color||color==='transparent'?0:color.startsWith('rgba(')?Number(color.slice(5,-1).split(',')[3]):1;
 for(const el of document.querySelectorAll('body *')){
  let visible=true,overlay=false;
  for(let p=el;p&&p!==document.body;p=p.parentElement){
   const s=getComputedStyle(p);
   if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0){visible=false;break;}
   if(s.position==='fixed'||s.position==='sticky')overlay=true;
  }
  if(!visible||!overlay)continue;
  const cs=getComputedStyle(el),r=el.getBoundingClientRect();
  if(r.width<=0||r.height<=0)continue;
  const painted=alpha(cs.backgroundColor)>0||cs.backgroundImage!=='none'||
   ['Top','Right','Bottom','Left'].some(side=>parseFloat(cs[`border${side}Width`])>0&&alpha(cs[`border${side}Color`])>0)||
   [...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
  if(!painted)continue;
  let left=r.left,right=r.right,top=r.top,bottom=r.bottom;
  for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){
   const s=getComputedStyle(p),clip=p.getBoundingClientRect();
   if(['hidden','clip','auto','scroll'].includes(s.overflowX)){left=Math.max(left,clip.left);right=Math.min(right,clip.right);}
   if(['hidden','clip','auto','scroll'].includes(s.overflowY)){top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}
  }
  if(right<=left||bottom<=top)continue;
  const ratio=(right-left)*(bottom-top)/Math.max(1,vp),id=el.id||el.className;
  if(left<-.5||top<-.5||right>innerWidth+.5||bottom>innerHeight+.5)issues.push({type:'out-of-bounds',id});
  if(ratio>.08)issues.push({type:'large-persistent-overlay',id,ratio});
  persistent.push({id,ratio});
 }
 const toolbar=document.querySelector('#goldenToolbar'),r=toolbar?.getBoundingClientRect();
 return {issues,persistent,toolbarRatio:r?r.width*r.height/Math.max(1,vp):0};
}
module.exports={auditHud};
