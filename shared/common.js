
(function(){
  const tokenKey = 'webgl_hub_token';
  const state = { appId:'global', user:null, socket:null, ready:false };
  function qs(id){return document.getElementById(id)}
  function el(tag, cls, text){const e=document.createElement(tag); if(cls)e.className=cls; if(text!==undefined)e.textContent=text; return e;}
  function showToast(text){let t=el('div','toast',text); document.body.appendChild(t); setTimeout(()=>t.remove(),2600);}
  async function api(path, opts={}){
    const token=localStorage.getItem(tokenKey);
    const headers=Object.assign({'Content-Type':'application/json'}, opts.headers||{});
    if(token) headers.Authorization='Bearer '+token;
    const res=await fetch(path,Object.assign({},opts,{headers}));
    const json=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(json.error||'Ошибка сервера');
    return json;
  }
  class MiniSocket{
    constructor(){
      this.handlers={}; this.queue=[]; this.connected=false; this.closed=false;
      const token=encodeURIComponent(localStorage.getItem(tokenKey)||'');
      const proto=location.protocol==='https:'?'wss':'ws';
      this.ws=new WebSocket(`${proto}://${location.host}/ws?token=${token}`);
      this.ws.onopen=()=>{ this.connected=true; this._trigger('connect'); for(const m of this.queue.splice(0)) this.ws.send(JSON.stringify(m)); };
      this.ws.onmessage=e=>{ try{ const msg=JSON.parse(e.data); this._trigger(msg.event,msg.data); }catch{} };
      this.ws.onclose=()=>{ this.connected=false; this.closed=true; this._trigger('disconnect'); };
      this.ws.onerror=()=>showToast('WebSocket ошибка');
    }
    emit(event,data){ const msg={event,data}; if(this.connected&&this.ws.readyState===1) this.ws.send(JSON.stringify(msg)); else this.queue.push(msg); }
    on(event,fn){ (this.handlers[event]||(this.handlers[event]=[])).push(fn); return this; }
    disconnect(){ try{this.ws.close();}catch{} }
    _trigger(event,data){ for(const fn of this.handlers[event]||[]) try{ fn(data); }catch(e){ console.error(e); } }
  }
  function buildAuth(){ const box=el('div','hud-panel'); box.id='authBox'; document.body.appendChild(box); renderAuth(); }
  function renderAuth(){
    const box=qs('authBox'); if(!box) return;
    box.innerHTML='';
    const h=el('h3',null,'Аккаунт для всех приложений'); box.appendChild(h);
    if(state.user){
      const row=el('div','loggedRow'); row.innerHTML=`<span class="loggedName">${escapeHtml(state.user.username)}</span>`; const out=el('button',null,'Выйти'); out.onclick=logout; row.appendChild(out); box.appendChild(row); const small=el('div',null,'Ник в играх берётся из аккаунта.'); small.style.cssText='font-size:12px;color:#9fb0c0;margin-top:6px'; box.appendChild(small); return;
    }
    const name=el('input'); name.id='authName'; name.placeholder='ник'; name.maxLength=20;
    const pass=el('input'); pass.id='authPass'; pass.placeholder='пароль'; pass.type='password';
    const row=el('div'); row.style.display='flex'; row.style.gap='6px';
    const login=el('button',null,'Войти'); const reg=el('button',null,'Рег');
    login.onclick=()=>loginOrRegister('/api/login'); reg.onclick=()=>loginOrRegister('/api/register'); row.append(login,reg);
    const msg=el('div'); msg.id='authMsg';
    box.append(name,pass,row,msg);
  }
  async function loginOrRegister(path){
    const username=qs('authName').value.trim(); const password=qs('authPass').value;
    try{ const json=await api(path,{method:'POST',body:JSON.stringify({username,password})}); localStorage.setItem(tokenKey,json.token); state.user=json.user; renderAuth(); showToast('Аккаунт: '+json.user.username); setTimeout(()=>location.reload(),450); }
    catch(e){ qs('authMsg').textContent=e.message; }
  }
  async function logout(){ try{ await api('/api/logout',{method:'POST'}); }catch{} localStorage.removeItem(tokenKey); state.user=null; renderAuth(); showToast('Выход из аккаунта'); setTimeout(()=>location.reload(),450); }
  async function loadMe(){ const token=localStorage.getItem(tokenKey); if(!token) return; try{ const json=await api('/api/me'); state.user=json.user; }catch{ localStorage.removeItem(tokenKey); state.user=null; } }
  function buildChat(){
    const chat=el('div','mc-chat'); chat.innerHTML=`<div class="mc-lines" id="chatLines"></div><div class="mc-input-row"><input class="mc-input" id="chatInput" placeholder="[Global] Нажми Enter для чата..." maxlength="220"><button class="mc-send" id="chatSend">Send</button></div>`; document.body.appendChild(chat);
    qs('chatSend').onclick=sendChat; qs('chatInput').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); sendChat(); }});
  }
  function addChat(msg){
    const lines=qs('chatLines'); if(!lines) return;
    const div=el('div','mc-line'); const time=new Date(msg.ts||Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    div.innerHTML=`<span class="mc-app">[${escapeHtml(msg.app||'global')}]</span> <span class="mc-name ${msg.account?'acc':''}">&lt;${escapeHtml(msg.name||'Guest')}&gt;</span> ${escapeHtml(msg.text||'')} <span class="mc-app">${time}</span>`;
    lines.appendChild(div); while(lines.children.length>10) lines.removeChild(lines.firstChild); lines.scrollTop=lines.scrollHeight;
  }
  function sendChat(){ const input=qs('chatInput'); const text=input.value.trim(); if(!text||!state.socket) return; input.value=''; state.socket.emit('chat:send',{app:state.appId,text}); }
  function connectSocket(){
    state.socket=new MiniSocket();
    state.socket.on('connect',()=>state.socket.emit('app:join',state.appId));
    state.socket.on('auth:me',data=>{ if(data&&data.user){ state.user=data.user; renderAuth(); } });
    state.socket.on('chat:history',arr=>{ const lines=qs('chatLines'); if(lines) lines.innerHTML=''; (arr||[]).forEach(addChat); });
    state.socket.on('chat:message',addChat);
    state.socket.on('error:message',showToast);
    window.dispatchEvent(new CustomEvent('appcore:socket',{detail:state.socket}));
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  window.AppCore={ state, async init(appId){ state.appId=appId||'global'; await loadMe(); buildAuth(); buildChat(); connectSocket(); state.ready=true; return state; }, socket(){return state.socket}, toast:showToast, api, token:()=>localStorage.getItem(tokenKey), user:()=>state.user };
})();
