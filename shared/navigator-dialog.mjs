export class NavigatorDialog{
 constructor({onSubmit,onUndo,onRedo,onEyeMode,intro}={}){
  this.onSubmit=onSubmit;this.onUndo=onUndo;this.onRedo=onRedo;this.onEyeMode=onEyeMode;
  this.intro=intro||'Hi. I am your Navigator. Tell me what to make, or ask why this world behaves the way it does.';
  this.busy=false;this.reading=false;this.#mount();
 }
 #mount(){
  if(document.getElementById('navigatorDialog')){this.root=document.getElementById('navigatorDialog');return}
  const css=document.createElement('style');
  css.textContent=`#navigatorDialog{position:fixed;z-index:85;left:max(14px,env(safe-area-inset-left));right:max(14px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));margin:auto;max-width:1060px;color:#e8c58e;font-family:Inter,system-ui,sans-serif;background:linear-gradient(180deg,rgba(12,14,17,.91),rgba(4,5,7,.96));border:1px solid rgba(214,160,87,.38);box-shadow:0 18px 60px #000a,inset 0 0 48px #0008;padding:18px 20px 16px;backdrop-filter:blur(12px)}#navigatorDialog .navGrid{display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:center}.navSigil{text-align:center;font-weight:700;letter-spacing:.08em}.navSigil .eye{font-size:42px}.navCopy{white-space:pre-line;font-size:clamp(15px,2vw,23px);line-height:1.42}.navInputRow{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:14px}.navInputRow textarea{resize:none;min-height:48px;max-height:120px;background:#07090c;border:1px solid #a8753e88;color:#f4d8a8;border-radius:9px;padding:13px 15px;font:16px/1.25 system-ui}.navInputRow button,.navTools button{background:#101216;border:1px solid #b58147;color:#efc98e;border-radius:9px;padding:0 20px;font-weight:750;cursor:pointer}.navTools{display:flex;gap:8px;align-items:center;margin-top:8px;font-size:12px;color:#b49b78;flex-wrap:wrap}.navTools button{padding:6px 10px}.navStatus{margin-left:auto}`;
  css.textContent+=`@media(max-width:650px){#navigatorDialog{padding:13px}.navGrid{grid-template-columns:72px 1fr!important;gap:8px!important}.navCopy{font-size:14px!important}.navInputRow{grid-template-columns:1fr 84px}.navInputRow textarea{font-size:14px;padding:10px}.navInputRow button{padding:0 9px}}@media(prefers-reduced-motion:reduce){#navigatorDialog,#navigatorDialog *{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}@media(prefers-contrast:more),(forced-colors:active){#navigatorDialog{background:#000;color:#fff;border-color:currentColor;backdrop-filter:none}#navigatorDialog textarea,#navigatorDialog button{background:#000;color:#fff;border:2px solid currentColor}}`;
  document.head.appendChild(css);
  this.root=document.createElement('section');this.root.id='navigatorDialog';
  this.root.setAttribute('role','region');this.root.setAttribute('aria-label','Dark Void Navigator');
  this.root.innerHTML=`<div class="navGrid"><div class="navSigil" aria-hidden="true"><div class="eye">◈</div><div>NAVIGATOR</div></div><div class="navCopy" role="status" aria-live="polite" aria-atomic="true"></div></div><div class="navInputRow"><textarea id="navigatorInput" maxlength="320" rows="1" placeholder="Create something, or ask me why…" aria-label="Talk to the Navigator"></textarea><button id="navigatorCreate" aria-label="Send to Navigator">Go ›</button></div><div class="navTools" aria-label="Navigator tools"><button data-a="undo">Undo</button><button data-a="redo">Redo</button><button data-a="eye">Eye: camera</button><button data-a="read" aria-pressed="false">Read aloud</button><span class="navStatus" aria-live="polite">ready</span></div>`;
  document.body.appendChild(this.root);this.root.querySelector('.navCopy').textContent=this.intro;
  this.input=this.root.querySelector('#navigatorInput');this.create=this.root.querySelector('#navigatorCreate');
  this.status=this.root.querySelector('.navStatus');this.eyeBtn=this.root.querySelector('[data-a="eye"]');this.readBtn=this.root.querySelector('[data-a="read"]');
  this.create.onclick=()=>this.submit();
  this.input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.submit()}});
  this.root.querySelector('[data-a="undo"]').onclick=()=>this.onUndo?.();this.root.querySelector('[data-a="redo"]').onclick=()=>this.onRedo?.();
  this.eyeBtn.onclick=async()=>{const m=await this.onEyeMode?.();if(m)this.eyeBtn.textContent=`Eye: ${m}`};
  this.readBtn.onclick=()=>this.toggleReadAloud();
 }
 toggleReadAloud(){
  const speech=globalThis.speechSynthesis;if(!speech||typeof globalThis.SpeechSynthesisUtterance!=='function'){this.setStatus('Read aloud is unavailable on this device');return false}
  if(this.reading){speech.cancel();this.reading=false;this.readBtn?.setAttribute('aria-pressed','false');this.readBtn&&(this.readBtn.textContent='Read aloud');return false}
  const text=this.root?.querySelector('.navCopy')?.textContent?.trim();if(!text)return false;
  const utterance=new globalThis.SpeechSynthesisUtterance(text);utterance.lang='en-US';
  utterance.onend=utterance.onerror=()=>{this.reading=false;this.readBtn?.setAttribute('aria-pressed','false');if(this.readBtn)this.readBtn.textContent='Read aloud'};
  speech.cancel();speech.speak(utterance);this.reading=true;this.readBtn?.setAttribute('aria-pressed','true');this.readBtn&&(this.readBtn.textContent='Stop reading');return true;
 }
 async submit(){const text=this.input.value.trim();if(!text||this.busy)return;this.setBusy(true);this.setStatus('Navigator is thinking…');try{const r=await this.onSubmit?.(text);this.input.value='';if(r?.message)this.setMessage(r.message);this.setStatus(r?.created?'The world changed':'Ask or create anything')}catch(e){this.setStatus(e?.message||'Creation error')}finally{this.setBusy(false)}}
 setBusy(v){this.busy=!!v;this.create.disabled=this.busy;this.input.disabled=this.busy;this.root?.setAttribute('aria-busy',String(this.busy))}
 setMessage(t){const e=this.root?.querySelector('.navCopy');if(e)e.textContent=String(t||'')}
 setStatus(t){if(this.status)this.status.textContent=String(t||'')}
 show(){this.root.style.display='block'}hide(){globalThis.speechSynthesis?.cancel?.();this.reading=false;this.root.style.display='none'}
}
