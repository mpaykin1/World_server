'use strict';
(function mobileGameShellBootstrap(){
  if (window.__MOBILE_GAME_SHELL_V2__) return;
  window.__MOBILE_GAME_SHELL_V2__ = true;

  const cfg = window.MobileGameShellConfig || {};
  const eyeBaseScales = new WeakMap();
  const state = {
    enabled:false,
    mobile:false,
    portrait:false,
    fullscreen:false,
    standalone:false,
    navigator:null,
    eyeDom:null,
    eyeObject:null,
    nativeGoldenLook:cfg.nativeGoldenLook === true || window.__GOLDEN_LOOK_NATIVE__ === true,
    movedActions:[],
    observer:null,
    reconcileQueued:false,
    goldenReady:false,
    keyboardOpen:false,
    version:'2.0.0'
  };

  const qAll = selector => { try { return [...document.querySelectorAll(selector)]; } catch { return []; } };
  const uniq = xs => [...new Set(xs.filter(Boolean))];
  const isEditable = el => !!el && (el.matches?.('textarea,input,select,[contenteditable="true"]') || el.closest?.('[contenteditable="true"]'));

  function isTouchMobile(){
    if (window.__MGS_TEST_MODE__ === true && new URLSearchParams(location.search).get('mobileShell') === '1') return true; // test-only override; URL alone never alters desktop
    const coarse = window.matchMedia?.('(pointer:coarse)')?.matches === true;
    const anyCoarse = window.matchMedia?.('(any-pointer:coarse)')?.matches === true;
    const touch = (navigator.maxTouchPoints || 0) > 0;
    const ua = navigator.userAgent || '';
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua) || (/Macintosh/i.test(ua) && touch && (navigator.maxTouchPoints || 0) > 1);
    // maxTouchPoints is not required when the UA itself is unambiguous -
    // some WebKit builds (Playwright's mobile-webkit/iPhone emulation)
    // report maxTouchPoints=0 despite a real mobile UA; see the matching
    // fix in shared/ai3d-playable-runtime.js's needsTouchControls().
    if (uaMobile) return true;
    const compactScreen = Math.min(screen.width || innerWidth, screen.height || innerHeight) <= 1180;
    return touch && (coarse || anyCoarse) && compactScreen;
  }

  function isStandalone(){
    return window.matchMedia?.('(display-mode: standalone)')?.matches === true || navigator.standalone === true;
  }

  function updateVisualViewport(){
    if (!state.enabled) return;
    const vv = window.visualViewport;
    const vvHeight = Math.max(1, vv?.height || innerHeight || document.documentElement.clientHeight || 1);
    const layoutHeight = Math.max(innerHeight || 0, document.documentElement.clientHeight || 0, vvHeight);
    const keyboardInset = Math.max(0, Math.round(layoutHeight - vvHeight - Math.max(0, vv?.offsetTop || 0)));
    const focusedEditable = isEditable(document.activeElement);
    state.keyboardOpen = focusedEditable;
    document.documentElement.style.setProperty('--mgs-vv-height', `${Math.round(vvHeight)}px`);
    document.documentElement.style.setProperty('--mgs-keyboard-inset', `${state.keyboardOpen ? keyboardInset : 0}px`);
    document.documentElement.dataset.mobileKeyboard = state.keyboardOpen ? '1' : '0';
  }

  function updateOrientation(){
    if (!state.enabled) return;
    state.portrait = innerHeight >= innerWidth;
    document.documentElement.dataset.mobileOrientation = state.portrait ? 'portrait' : 'landscape';
    applyEyeScale();
    updateVisualViewport();
    updateNavigatorHeight();
  }

  function findBySelectors(list){
    for (const s of list || []) {
      const node = document.querySelector(s);
      if (node) return node;
    }
    return null;
  }

  function findNavigatorPanel(){
    const exact = findBySelectors(cfg.selectors?.navigatorPanel);
    if (exact) return exact;
    const inputs = uniq((cfg.selectors?.navigatorInput || []).flatMap(qAll));
    for (const input of inputs) {
      let p = input.parentElement;
      for (let i=0; p && i<7; i++, p=p.parentElement) {
        const text = (p.innerText || '').toLowerCase();
        if (text.includes('навигатор') || text.includes('что хочешь создать')) return p;
      }
    }
    return [...document.querySelectorAll('section,aside,form,div')].find(el => {
      if (el.closest?.('#mgsMenu,#goldenUiShell')) return false;
      const t = (el.innerText || '').trim();
      return t.includes('НАВИГАТОР') && !!el.querySelector('textarea,input[type="text"]');
    }) || null;
  }

  function findEyeDom(){
    const exact = findBySelectors(cfg.selectors?.eyeDom);
    if (exact && exact.tagName !== 'CANVAS' && !exact.closest?.('.mgs-navigator-panel,#mgsMenu,#goldenUiShell')) return exact;
    // Conservative fallback: never touch canvas or a generic div; scaling the WebGL canvas would shrink the whole game.
    return [...document.querySelectorAll('img,svg')].find(el => {
      if (el.closest?.('.mgs-navigator-panel,#mgsMenu,#goldenUiShell,button')) return false;
      return /(^|[-_])(?:player-)?eye($|[-_])/i.test(el.id || '') || /(^|\s)(?:player-)?eye(?:-avatar)?(\s|$)/i.test(String(el.className?.baseVal || el.className || ''));
    }) || null;
  }

  function findGameSurface(){
    const nodes = uniq((cfg.selectors?.gameSurface || ['canvas']).flatMap(qAll)).filter(el => {
      const r=el.getBoundingClientRect?.();
      return r && r.width > 10 && r.height > 10;
    });
    nodes.sort((a,b) => {
      const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect();
      return (br.width*br.height) - (ar.width*ar.height);
    });
    return nodes[0] || document.body || document.documentElement;
  }

  function hideTouchHints(){
    if (cfg.hideTouchControlHints === false) return;
    (cfg.selectors?.mobileHint || []).flatMap(qAll).forEach(el => el.classList.add('mgs-control-hint-hidden'));
    const fragments = cfg.hintTextFragments || [];
    if (!fragments.length) return;
    [...document.querySelectorAll('body *')].forEach(el => {
      if (el.closest?.('#mgsMenu,#goldenUiShell')) return;
      if (el.children.length > 4) return;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 220) return;
      if (fragments.some(f => text.includes(f))) el.classList.add('mgs-control-hint-hidden');
    });
  }

  function updateNavigatorHeight(){
    const nav = state.navigator;
    if (!nav?.isConnected || !state.enabled) return;
    requestAnimationFrame(() => {
      if (!nav.isConnected) return;
      const cap = state.portrait ? innerHeight * .27 : innerHeight * .25;
      const measured = nav.getBoundingClientRect().height || cap;
      const h = Math.max(82, Math.min(cap, measured));
      document.documentElement.style.setProperty('--mgs-nav-height', `${Math.ceil(h)}px`);
    });
  }

  function setupNavigator(){
    if (state.navigator?.isConnected) return;
    const nav = findNavigatorPanel();
    if (!nav) return;
    state.navigator = nav;
    nav.classList.add('mgs-navigator-panel');
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(updateNavigatorHeight);
      ro.observe(nav);
      nav.__mgsResizeObserver = ro;
    }
    updateNavigatorHeight();
  }

  function setupEye(){
    if (state.eyeDom?.isConnected) return;
    const eye = findEyeDom();
    if (!eye) return;
    state.eyeDom = eye;
    eye.classList.add('mgs-eye-dom');
  }

  function applyEyeScale(){
    const scale = state.portrait ? Number(cfg.portraitEyeScale ?? .70) : Number(cfg.landscapeEyeScale ?? 1);
    if (!Number.isFinite(scale) || scale <= 0) return;
    if (state.eyeObject?.scale?.set) {
      let base = eyeBaseScales.get(state.eyeObject);
      if (!base) {
        base = {x:state.eyeObject.scale.x, y:state.eyeObject.scale.y, z:state.eyeObject.scale.z};
        eyeBaseScales.set(state.eyeObject, base);
      }
      state.eyeObject.scale.set(base.x * scale, base.y * scale, base.z * scale);
    }
    document.documentElement.style.setProperty('--mgs-eye-scale', String(scale));
  }

  function registerEyeObject(object3D){
    if (!object3D?.scale?.set) return false;
    state.eyeObject = object3D;
    if (!eyeBaseScales.has(object3D)) {
      eyeBaseScales.set(object3D, {x:object3D.scale.x, y:object3D.scale.y, z:object3D.scale.z});
    }
    applyEyeScale();
    return true;
  }

  function setEyeBaseScale(x,y=x,z=x){
    if (!state.eyeObject || ![x,y,z].every(Number.isFinite)) return false;
    eyeBaseScales.set(state.eyeObject,{x,y,z});
    applyEyeScale();
    return true;
  }

  function styleGoldenLookKnob(){
    const look = document.getElementById('goldenLookZone');
    if (!look || look.querySelector('#mgsLookKnob')) return;
    const knob = document.createElement('div');
    knob.id = 'mgsLookKnob';
    knob.setAttribute('aria-hidden','true');
    look.appendChild(knob);
    let id = null, start = null;
    const radius = () => Math.max(24, (look.getBoundingClientRect().width - knob.getBoundingClientRect().width) * .34);
    const move = e => {
      if (id !== e.pointerId || !start) return;
      const dx=e.clientX-start.x, dy=e.clientY-start.y;
      const max=radius(), len=Math.hypot(dx,dy)||1, k=Math.min(1,max/len);
      knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;
    };
    look.addEventListener('pointerdown', e => { id=e.pointerId; start={x:e.clientX,y:e.clientY}; move(e); }, {passive:true});
    look.addEventListener('pointermove', move, {passive:true});
    const end = e => { if (id!==e.pointerId) return; id=null; start=null; knob.style.transform=''; };
    look.addEventListener('pointerup', end, {passive:true});
    look.addEventListener('pointercancel', end, {passive:true});
  }

  function bridgeGoldenLookToExistingMouseLook(){
    if (window.__MGS_GOLDEN_LOOK_BRIDGE_V2__) return;
    window.__MGS_GOLDEN_LOOK_BRIDGE_V2__ = true;
    addEventListener('goldenlook', e => {
      if (state.nativeGoldenLook || window.__GOLDEN_LOOK_NATIVE__ === true) return;
      const dx = Number(e.detail?.dx || 0), dy = Number(e.detail?.dy || 0);
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return;
      const target = findGameSurface();
      try {
        const ev = new MouseEvent('mousemove', {bubbles:true, cancelable:true, view:window});
        Object.defineProperty(ev, 'movementX', {value:dx});
        Object.defineProperty(ev, 'movementY', {value:dy});
        Object.defineProperty(ev, '__fromGoldenMobile', {value:true});
        target.dispatchEvent(ev); // bubbles through canvas -> document -> window, covering the common desktop listeners once
      } catch {
        target.dispatchEvent(new CustomEvent('mobilelook', {detail:{dx,dy}, bubbles:true}));
      }
    });
  }

  function setNativeGoldenLook(enabled=true){ state.nativeGoldenLook = !!enabled; }

  function validateGoldenControls(){
    const root=document.getElementById('goldenMobileControls');
    const move=document.getElementById('goldenMovePad');
    const look=document.getElementById('goldenLookZone');
    const valid=!!(root && move && look && root.contains(move) && root.contains(look));
    state.goldenReady=valid;
    document.documentElement.dataset.goldenMobileReady=valid?'1':'0';
    if (valid) styleGoldenLookKnob();
    return valid;
  }

  function ensureGoldenControls(){
    const golden = window.GameGoldenStandard;
    if (golden?.installMobileControls) {
      golden.installMobileControls();
      validateGoldenControls();
      return;
    }
    let attempts=0;
    const timer=setInterval(() => {
      attempts++;
      const api=window.GameGoldenStandard;
      if (api?.installMobileControls) {
        clearInterval(timer);
        api.installMobileControls();
        validateGoldenControls();
      } else if (attempts > 80) {
        clearInterval(timer);
        console.error('[MobileGameShell] Golden Standard runtime did not become available.');
      }
    }, 50);
  }

  function findButtonsByText(text){
    const normalized = text.trim().toLowerCase();
    return [...document.querySelectorAll('button,[role="button"],a')].filter(el => {
      if (el.closest?.('#mgsMenu,#goldenUiShell')) return false;
      return (el.textContent || '').trim().toLowerCase() === normalized;
    });
  }

  function getExistingGoldenMenuHost(){
    const packed=window.GoldenUIShell?.packed;
    return packed?.isConnected ? packed : null;
  }

  function ensureFallbackMenu(){
    let menu=document.getElementById('mgsMenu');
    if (menu) return menu;
    menu=document.createElement('div');
    menu.id='mgsMenu'; menu.setAttribute('role','menu'); menu.dataset.open='0';
    document.body.appendChild(menu);
    appendFullscreenFallback(menu);
    return menu;
  }

  function setupChrome(){
    let chrome=document.getElementById('mgsChrome');
    if (!chrome) {
      chrome = document.createElement('div');
      chrome.id='mgsChrome';
      document.body.appendChild(chrome);
    }
    let fsBtn=document.getElementById('mgsFullscreenButton');
    if (!fsBtn) {
      fsBtn=document.createElement('button');
      fsBtn.id='mgsFullscreenButton'; fsBtn.className='mgs-icon-btn'; fsBtn.type='button';
      fsBtn.setAttribute('aria-label','На полный экран'); fsBtn.textContent='⛶';
      fsBtn.addEventListener('click', requestFullscreenBestEffort);
      chrome.appendChild(fsBtn);
    }
    fsBtn.hidden = cfg.fullscreenButton === false;

    const goldenHost=getExistingGoldenMenuHost();
    let menuBtn=document.getElementById('mgsMenuButton');
    if (goldenHost) {
      if (menuBtn) menuBtn.remove();
      const fallback=document.getElementById('mgsMenu');
      if (fallback) {
        for (const action of [...fallback.querySelectorAll('.mgs-menu-action')]) goldenHost.appendChild(action);
        fallback.remove();
      }
      return;
    }
    const menu=ensureFallbackMenu();
    if (!menuBtn) {
      menuBtn=document.createElement('button');
      menuBtn.id='mgsMenuButton'; menuBtn.className='mgs-icon-btn'; menuBtn.type='button'; menuBtn.textContent='☰';
      menuBtn.setAttribute('aria-label','Меню'); menuBtn.setAttribute('aria-expanded','false');
      menuBtn.addEventListener('click', () => {
        const open=menu.dataset.open !== '1';
        menu.dataset.open=open?'1':'0'; menuBtn.setAttribute('aria-expanded',String(open));
      });
      chrome.insertBefore(menuBtn,fsBtn);
    }
  }

  function menuHost(){ return getExistingGoldenMenuHost() || ensureFallbackMenu(); }

  function pruneMovedActions(){
    state.movedActions = state.movedActions.filter(item => item.el?.isConnected || item.placeholder?.isConnected);
  }

  function moveSecondaryActionsIntoMenu(){
    if (cfg.moveSecondaryActionsToMenu === false) return;
    const host=menuHost();
    pruneMovedActions();
    for (const text of cfg.secondaryActionText || []) {
      for (const el of findButtonsByText(text)) {
        if (!el.parentNode || host.contains(el)) continue;
        const placeholder = document.createComment(`mgs:${text}`);
        el.parentNode.insertBefore(placeholder, el);
        state.movedActions.push({el,placeholder,text});
        host.appendChild(el); // preserve original node/listeners; no duplicate action implementation
        el.classList.add('mgs-menu-action');
      }
    }
  }

  function appendFullscreenFallback(menu){
    if (menu.querySelector?.('#mgsPwaNotice')) return;
    const note=document.createElement('div'); note.id='mgsPwaNotice'; note.hidden=true;
    note.textContent='iPhone: если Safari не убирает панели, Поделиться → На экран «Домой» → открыть игру оттуда.';
    menu.appendChild(note);
  }

  function fullscreenNoticeHost(){
    return window.GoldenUIShell?.root?.querySelector?.('.goldenTab[data-tab="settings"]') || ensureFallbackMenu();
  }

  function showFullscreenFallback(){
    const host=fullscreenNoticeHost();
    appendFullscreenFallback(host);
    const note=host.querySelector?.('#mgsPwaNotice') || document.getElementById('mgsPwaNotice');
    if (note) note.hidden=false;
    if (host.id==='mgsMenu') {
      host.dataset.open='1';
      document.getElementById('mgsMenuButton')?.setAttribute('aria-expanded','true');
    } else if (window.GoldenUIShell?.open) {
      window.GoldenUIShell.open('settings');
    }
  }

  function syncFullscreenState(){
    state.standalone=isStandalone();
    state.fullscreen=!!(document.fullscreenElement || document.webkitFullscreenElement || state.standalone);
    document.documentElement.dataset.mobileFullscreen=state.fullscreen?'1':'0';
    const btn=document.getElementById('mgsFullscreenButton');
    if (btn) btn.setAttribute('aria-label',state.fullscreen?'Выйти из полного экрана':'На полный экран');
    return state.fullscreen;
  }

  async function requestFullscreenBestEffort(){
    if (syncFullscreenState() && !state.standalone) {
      try { await (document.exitFullscreen?.() || document.webkitExitFullscreen?.()); } catch {}
      syncFullscreenState();
      return state.fullscreen;
    }
    if (state.standalone) return true;
    const el=document.documentElement;
    const request=el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    let requested=false;
    if (request) {
      try {
        requested=true;
        await request.call(el, {navigationUI:'hide'});
      } catch {
        try { await request.call(el); } catch { requested=false; }
      }
    }
    // Some browsers resolve before fullscreenElement updates.
    await new Promise(resolve => setTimeout(resolve, requested ? 80 : 0));
    if (!syncFullscreenState()) showFullscreenFallback();
    return state.fullscreen;
  }

  function hideLegacyNonGoldenMobileControls(){
    if (!validateGoldenControls()) return;
    qAll('[data-legacy-mobile-controls="1"], .legacy-mobile-controls').forEach(el => {
      el.dataset.mgsSuppressed='1'; el.hidden=true;
    });
  }

  function reconcile(){
    if (!state.enabled) return;
    state.reconcileQueued=false;
    setupNavigator();
    setupEye();
    setupChrome();
    hideTouchHints();
    moveSecondaryActionsIntoMenu();
    if (validateGoldenControls()) hideLegacyNonGoldenMobileControls();
    updateNavigatorHeight();
  }

  function scheduleReconcile(){
    if (!state.enabled || state.reconcileQueued) return;
    state.reconcileQueued=true;
    requestAnimationFrame(reconcile);
  }

  function installObserver(){
    if (state.observer || !window.MutationObserver) return;
    state.observer=new MutationObserver(scheduleReconcile);
    state.observer.observe(document.body,{childList:true,subtree:true});
  }

  function installKeyboardHandling(){
    document.addEventListener('focusin',e=>{ if (isEditable(e.target)) setTimeout(updateVisualViewport,20); },true);
    document.addEventListener('focusout',e=>{ if (isEditable(e.target)) setTimeout(updateVisualViewport,120); },true);
    const vv=window.visualViewport;
    vv?.addEventListener('resize',updateVisualViewport,{passive:true});
    vv?.addEventListener('scroll',updateVisualViewport,{passive:true});
  }

  function installMenuDismiss(){
    document.addEventListener('pointerdown',e=>{
      const menu=document.getElementById('mgsMenu'), btn=document.getElementById('mgsMenuButton');
      if (!menu || menu.dataset.open!=='1' || menu.contains(e.target) || btn?.contains(e.target)) return;
      menu.dataset.open='0'; btn?.setAttribute('aria-expanded','false');
    },{passive:true});
    addEventListener('keydown',e=>{
      if (e.code!=='Escape') return;
      const menu=document.getElementById('mgsMenu'); if (menu) menu.dataset.open='0';
      document.getElementById('mgsMenuButton')?.setAttribute('aria-expanded','false');
    });
  }

  function install(){
    if (state.enabled) return true;
    state.mobile=isTouchMobile();
    if (!state.mobile) return false; // hard guarantee: no desktop DOM/class/layout mutation
    state.enabled=true;
    document.documentElement.dataset.mobileGameShell='1';
    state.nativeGoldenLook = cfg.nativeGoldenLook === true || window.__GOLDEN_LOOK_NATIVE__ === true;
    updateOrientation();
    reconcile();
    ensureGoldenControls();
    bridgeGoldenLookToExistingMouseLook();
    installObserver();
    installKeyboardHandling();
    installMenuDismiss();
    addEventListener('resize', updateOrientation, {passive:true});
    addEventListener('orientationchange', () => setTimeout(updateOrientation,80), {passive:true});
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    syncFullscreenState();
    // Async frameworks often render after DOMContentLoaded. Reconcile a few times without polling forever.
    [50,180,600,1600].forEach(ms=>setTimeout(scheduleReconcile,ms));
    return true;
  }

  window.MobileGameShell = Object.freeze({
    state,
    install,
    reconcile,
    registerEyeObject,
    setEyeBaseScale,
    setNativeGoldenLook,
    requestFullscreen:requestFullscreenBestEffort,
    updateOrientation,
    validateGoldenControls
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
