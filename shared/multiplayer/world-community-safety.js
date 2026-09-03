(function(global){'use strict';
class WorldCommunitySafety extends EventTarget{
  constructor({key='world.community.safety'}={}){super();this.key=key;this.state=this.read()}
  read(){try{return JSON.parse(localStorage.getItem(this.key)||'{"muted":[],"blocked":[]}')}catch{return{muted:[],blocked:[]}}}
  write(){try{localStorage.setItem(this.key,JSON.stringify(this.state))}catch{}}
  mute(id,on=true){const s=new Set(this.state.muted||[]);on?s.add(String(id)):s.delete(String(id));this.state.muted=[...s];this.write()}
  block(id,on=true){const s=new Set(this.state.blocked||[]);on?s.add(String(id)):s.delete(String(id));this.state.blocked=[...s];this.write()}
  isMuted(id){return(this.state.muted||[]).includes(String(id))} isBlocked(id){return(this.state.blocked||[]).includes(String(id))}
  shouldDisplay(msg){return !this.isBlocked(msg?.userId)&&!this.isMuted(msg?.userId)}
  async report({accessToken,message,reason='other',details=''}){const r=await fetch('/api/community-report',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${accessToken}`},body:JSON.stringify({targetUserId:message?.userId,messageId:message?.id||message?.client_message_id,worldId:message?.worldId,roomId:message?.roomId,locale:global.WorldI18n?.locale||'en',reason,details})});if(!r.ok)throw new Error(`report ${r.status}`);return r.json()}
}
global.WorldCommunitySafety=WorldCommunitySafety;
})(globalThis);
