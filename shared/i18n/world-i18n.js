(function(global){
  'use strict';
  const SUPPORTED = ['en','zh-CN','ja','ko','de','fr','es','pt-BR','it','ar','ru'];
  const RTL = new Set(['ar']);
  let messages = null;
  let locale = 'en';
  function canonical(input){
    const raw=String(input||'').trim(); if(!raw) return 'en';
    const lower=raw.toLowerCase();
    const exact=SUPPORTED.find(x=>x.toLowerCase()===lower); if(exact) return exact;
    if(lower.startsWith('zh')) return 'zh-CN';
    if(lower.startsWith('pt')) return 'pt-BR';
    const base=lower.split('-')[0]; return SUPPORTED.find(x=>x.toLowerCase()===base) || 'en';
  }
  function detect(){
    const saved=global.localStorage?.getItem('world.locale'); if(saved) return canonical(saved);
    const langs=global.navigator?.languages || [global.navigator?.language];
    for(const l of langs||[]){ const c=canonical(l); if(c!=='en' || String(l||'').toLowerCase().startsWith('en')) return c; }
    return 'en';
  }
  async function load(){
    if(messages) return messages;
    const r=await fetch('/shared/i18n/world-messages.json',{cache:'force-cache'}); if(!r.ok) throw new Error('i18n catalog unavailable');
    messages=await r.json(); return messages;
  }
  function applyDocument(){
    if(!global.document) return;
    document.documentElement.lang=locale; document.documentElement.dir=RTL.has(locale)?'rtl':'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el=>{ const v=t(el.getAttribute('data-i18n')); if(v) el.textContent=v; });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{ const v=t(el.getAttribute('data-i18n-placeholder')); if(v) el.setAttribute('placeholder',v); });
  }
  function t(key,vars){
    const pack=messages?.[locale]||messages?.en||{}; let out=pack[key] ?? messages?.en?.[key] ?? key;
    for(const [k,v] of Object.entries(vars||{})) out=String(out).replaceAll(`{${k}}`,String(v)); return out;
  }
  async function setLocale(next){ locale=canonical(next); try{global.localStorage?.setItem('world.locale',locale)}catch{}; await load(); applyDocument(); global.dispatchEvent?.(new CustomEvent('world:locale',{detail:{locale,dir:RTL.has(locale)?'rtl':'ltr'}})); return locale; }
  async function init(){ await load(); return setLocale(detect()); }
  function createSelector(){
    const s=document.createElement('select'); s.setAttribute('aria-label',t('language')); s.dataset.worldLanguage='1';
    const names={'en':'English','zh-CN':'简体中文','ja':'日本語','ko':'한국어','de':'Deutsch','fr':'Français','es':'Español','pt-BR':'Português (Brasil)','it':'Italiano','ar':'العربية','ru':'Русский'};
    for(const code of SUPPORTED){ const o=document.createElement('option');o.value=code;o.textContent=names[code];o.selected=code===locale;s.appendChild(o); }
    s.addEventListener('change',()=>setLocale(s.value)); return s;
  }
  global.WorldI18n={SUPPORTED,canonical,detect,load,t,setLocale,init,createSelector,get locale(){return locale},isRTL(code=locale){return RTL.has(canonical(code))}};
})(globalThis);
