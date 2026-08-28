(function navigatorWorldLoop(){
  'use strict';

  const DEFAULT_POLICY = {
    schemaVersion: '1.0.0',
    active: {
      navigatorTone: 'mysterious',
      worldRefreshCadence: 'every-step',
      revealStrength: 'cinematic'
    }
  };
  const state = {
    policy: DEFAULT_POLICY,
    lastStepKey: '',
    requestSerial: 0,
    firstWorldReady: false,
    startedAt: performance.now(),
    iframe: null,
    status: null
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,Number(v)||0));

  function guestId(){
    let id = localStorage.iwGuestId;
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
      localStorage.iwGuestId = id;
    }
    return id;
  }

  function capture(event, properties = {}) {
    try {
      window.WorldServerPostHog?.capture(event, Object.assign({
        iw_surface: 'navigator-world-loop',
        navigatorTone: state.policy?.active?.navigatorTone || 'mysterious',
        worldRefreshCadence: state.policy?.active?.worldRefreshCadence || 'every-step',
        revealStrength: state.policy?.active?.revealStrength || 'cinematic'
      }, properties));
    } catch {}
  }

  function readDraft(){
    try { return JSON.parse(localStorage.iwDraft || '{}') || {}; }
    catch { return {}; }
  }

  function stepInfo(){
    const raw = String($('count')?.textContent || '1 / 31');
    const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
    const current = m ? Math.max(1, Number(m[1])) : 1;
    const total = m ? Math.max(1, Number(m[2])) : 31;
    return { step: current - 1, current, total, progress: current / total };
  }

  function journey(){
    const label = String($('journeyLabel')?.textContent || '').toLowerCase();
    return label.includes('ветка') ? 'join' : 'create';
  }

  function phaseFor(progress){
    if (progress <= .1) return ['ИСКРА', 'Пока существует только темнота, взгляд и первый ориентир.'];
    if (progress <= .28) return ['ПРОСТРАНСТВО', 'Мир получает форму, расстояние, свет и поверхность.'];
    if (progress <= .48) return ['ЖИВОЕ', 'В мире начинают появляться существа, характеры и желания.'];
    if (progress <= .7) return ['НАПРЯЖЕНИЕ', 'Рельеф, туман и препятствия начинают отражать конфликт истории.'];
    if (progress <= .9) return ['РЕШЕНИЕ', 'Появляются ориентиры, пути и места, к которым хочется идти.'];
    return ['ПРОЯВЛЕНИЕ', 'Мир становится самостоятельным и готовится к публикации или соединению.'];
  }

  async function loadPolicy(){
    try {
      const r = await fetch('/engagement-policy.json', { cache: 'no-store' });
      if (r.ok) state.policy = Object.assign({}, DEFAULT_POLICY, await r.json());
    } catch {}
  }

  function injectStyle(){
    if ($('iwNavigatorStyle')) return;
    const style = document.createElement('style');
    style.id = 'iwNavigatorStyle';
    style.textContent = `
      .iwIntro{position:fixed;inset:0;z-index:9999;background:#020306;color:#e9cf97;display:grid;grid-template-rows:1fr auto;overflow:hidden}
      .iwIntro::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 74% 37%,rgba(255,142,70,.12),transparent 12%),radial-gradient(circle at 22% 45%,rgba(197,173,112,.07),transparent 16%),linear-gradient(#020306,#05070a 65%,#010203)}
      .iwIntroScene{position:relative;min-height:58dvh}
      .iwEye{position:absolute;left:14%;top:43%;width:84px;height:44px;border-radius:52% 48% 52% 48%;background:radial-gradient(circle at 50% 50%,#0a0a08 0 17%,#6e5729 18% 31%,#d7d2bb 32% 53%,#17191b 54% 58%,transparent 59%);filter:drop-shadow(0 0 18px rgba(205,180,108,.12))}
      .iwFlame{position:absolute;right:22%;top:37%;width:12px;height:34px;border-radius:55% 45% 52% 48%;background:linear-gradient(#fff5ba,#ffb05f 48%,#ff6b36);box-shadow:0 0 18px #ff955b,0 0 65px rgba(255,119,63,.42);animation:iwFlicker .9s infinite alternate ease-in-out}
      .iwFlame::after{content:"";position:absolute;top:28px;left:-16px;width:44px;height:55px;background:linear-gradient(#15100d,#050505);clip-path:polygon(40% 0,65% 0,65% 22%,82% 22%,82% 44%,100% 44%,100% 100%,0 100%,0 62%,18% 62%,18% 40%,32% 40%)}
      @keyframes iwFlicker{from{transform:translateY(0) scale(.94) rotate(-2deg);opacity:.86}to{transform:translateY(-2px) scale(1.06) rotate(2deg);opacity:1}}
      .iwIntroDialog{position:relative;margin:0 max(16px,2vw) max(18px,env(safe-area-inset-bottom));border:1px solid #806a44;border-radius:18px;background:rgba(8,10,12,.94);box-shadow:0 0 60px rgba(0,0,0,.8);padding:20px;display:grid;grid-template-columns:150px 1fr;gap:22px;align-items:center}
      .iwSigil{font-size:46px;line-height:1}.iwNavName{font-size:12px;letter-spacing:.16em;margin-top:6px}.iwIntroText{font-size:clamp(18px,2.6vw,30px);line-height:1.42;color:#efd5a5}.iwIntroActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.iwIntro button{border:1px solid #8e7549;background:#16120e;color:#f0d49f;border-radius:12px;min-height:48px;padding:10px 16px;font-weight:800;cursor:pointer}
      .iwWorldStage{grid-column:1/-1;position:relative;overflow:hidden;min-height:clamp(320px,48dvh,620px);background:#020306;border-color:#34313a}.iwWorldStage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#020306}.iwWorldShade{pointer-events:none;position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.24),transparent 30%,transparent 70%,rgba(0,0,0,.48));z-index:2}.iwWorldHud{position:absolute;z-index:3;left:12px;right:12px;top:12px;display:flex;justify-content:space-between;gap:8px;pointer-events:none}.iwWorldBadge{border:1px solid rgba(239,213,165,.34);background:rgba(5,6,8,.74);backdrop-filter:blur(9px);border-radius:12px;padding:9px 11px;color:#efd5a5;font-size:12px}.iwWorldStatus{position:absolute;z-index:3;left:12px;bottom:12px;max-width:min(620px,calc(100% - 24px));border:1px solid rgba(239,213,165,.28);background:rgba(4,5,7,.78);backdrop-filter:blur(9px);border-radius:12px;padding:10px 12px;color:#d9c8a5;font-size:13px}.iwNavigatorLine{border:1px solid #51452f;border-radius:16px;background:linear-gradient(135deg,rgba(23,18,12,.92),rgba(9,11,15,.96));padding:12px 14px;margin:0 0 12px;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}.iwNavigatorIcon{width:38px;height:38px;border:1px solid #8e7549;border-radius:50%;display:grid;place-items:center;color:#e4c983}.iwNavigatorCaption{font-size:10px;letter-spacing:.14em;color:#b99d69}.iwNavigatorEcho{font-size:14px;color:#e7dbc1;margin-top:3px}
      @media(max-width:780px){.iwIntroDialog{grid-template-columns:72px 1fr;gap:10px;padding:14px}.iwSigil{font-size:34px}.iwEye{left:12%;top:46%;width:64px;height:34px}.iwFlame{right:20%;top:38%}.iwWorldStage{min-height:42dvh}.iwWorldHud{flex-direction:column;right:auto}.iwWorldBadge{width:max-content;max-width:88vw}}
    `;
    document.head.appendChild(style);
  }

  function showIntro(){
    if (location.hash === '#why' || $('iwNavigatorIntro')) return;
    const intro = document.createElement('section');
    intro.id = 'iwNavigatorIntro';
    intro.className = 'iwIntro';
    intro.innerHTML = `
      <div class="iwIntroScene"><div class="iwEye" aria-hidden="true"></div><div class="iwFlame" aria-hidden="true"></div></div>
      <div class="iwIntroDialog">
        <div><div class="iwSigil">◉</div><div class="iwNavName">НАВИГАТОР</div></div>
        <div><div class="iwIntroText">Привет. Я твой навигатор по этому миру.<br>Тут может появиться всё, что ты захочешь.<br>И всё, что в этом мире появится… это тоже будешь ты…</div><div class="iwIntroActions"><button id="iwStartCreate">Создать свой мир</button><button id="iwStartJoin">Войти в чужой мир</button></div></div>
      </div>`;
    document.body.appendChild(intro);
    capture('iw_navigator_intro_viewed');
    $('iwStartCreate').addEventListener('click', () => {
      capture('iw_navigator_started', { journey: 'create' });
      intro.remove();
      window.startCreate?.();
      setTimeout(() => { ensureWizardEnhancement(); refreshPreview('intro-start'); }, 0);
    });
    $('iwStartJoin').addEventListener('click', () => {
      capture('iw_navigator_started', { journey: 'join' });
      intro.remove();
      window.showJoin?.();
    });
  }

  function ensureWizardEnhancement(){
    const wizard = $('wizard');
    const grid = wizard?.querySelector('.wizardGrid');
    const panel = grid?.querySelector('.panel.card');
    if (!grid || !panel) return;

    if (!$('iwWorldStage')) {
      const stage = document.createElement('section');
      stage.id = 'iwWorldStage';
      stage.className = 'iwWorldStage card';
      stage.innerHTML = `<iframe id="iwWorldFrame" title="Живой мир" allow="fullscreen; autoplay; gamepad"></iframe><div class="iwWorldShade"></div><div class="iwWorldHud"><div id="iwWorldPhase" class="iwWorldBadge">ИСКРА</div><div id="iwWorldProgress" class="iwWorldBadge">Мир 1%</div></div><div id="iwWorldStatus" class="iwWorldStatus">Навигатор ждёт твоего первого ответа.</div>`;
      grid.prepend(stage);
      state.iframe = $('iwWorldFrame');
      state.status = $('iwWorldStatus');
      state.iframe.addEventListener('load', () => {
        if (state.status) state.status.textContent = 'Мир готов. Можно осматриваться и ходить, а потом вернуться к разговору.';
      });
    }

    if (!$('iwNavigatorLine')) {
      const line = document.createElement('div');
      line.id = 'iwNavigatorLine';
      line.className = 'iwNavigatorLine';
      line.innerHTML = `<div class="iwNavigatorIcon">◉</div><div><div class="iwNavigatorCaption">НАВИГАТОР СПРАШИВАЕТ</div><div id="iwNavigatorEcho" class="iwNavigatorEcho"></div></div>`;
      panel.insertBefore(line, panel.firstChild);
    }
    updateNavigatorEcho();
  }

  function updateNavigatorEcho(){
    const info = stepInfo();
    const [phase, note] = phaseFor(info.progress);
    const echo = $('iwNavigatorEcho');
    if (echo) echo.textContent = $('question')?.textContent || 'Расскажи, что начинает появляться вокруг.';
    if ($('iwWorldPhase')) $('iwWorldPhase').textContent = phase;
    if ($('iwWorldProgress')) $('iwWorldProgress').textContent = `Проявление ${Math.round(info.progress * 100)}%`;
    if (state.status && !state.firstWorldReady) state.status.textContent = note;
  }

  function answerMetrics(draft){
    const raw = JSON.stringify(draft || {});
    const chars = Array.isArray(draft?.chars) ? draft.chars.length : 0;
    const worlds = Array.isArray(draft?.worlds) ? draft.worlds.length : 0;
    return { answerSizeBucket: raw.length < 200 ? 'tiny' : raw.length < 800 ? 'short' : raw.length < 2400 ? 'medium' : 'deep', entities: chars + worlds };
  }

  async function refreshPreview(reason){
    if (!$('wizard') || $('wizard').classList.contains('hide')) return;
    ensureWizardEnhancement();
    const info = stepInfo();
    const key = `${journey()}:${info.current}/${info.total}`;
    if (reason === 'step-change' && key === state.lastStepKey) return;
    state.lastStepKey = key;
    const serial = ++state.requestSerial;
    const draft = readDraft();
    const metrics = answerMetrics(draft);

    if (state.status) state.status.textContent = `Мир перестраивается после ответа ${info.current}/${info.total}…`;
    capture('iw_navigator_step', Object.assign({ journey: journey(), step: info.current, totalSteps: info.total, reason }, metrics));

    try {
      const r = await fetch('/api/world', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'preview',
          guestId: guestId(),
          journey: journey(),
          answers: draft,
          step: info.step,
          totalSteps: info.total
        })
      });
      const data = await r.json().catch(() => null);
      if (serial !== state.requestSerial) return;
      if (!r.ok || !data?.playUrl) throw new Error(data?.error || `preview ${r.status}`);
      const joiner = data.playUrl.includes('?') ? '&' : '?';
      const nextSrc = `${data.playUrl}${joiner}iwPreview=${encodeURIComponent(data.revision || String(Date.now()))}`;
      if (state.iframe && state.iframe.src !== nextSrc) state.iframe.src = nextSrc;
      const wasFirst = state.firstWorldReady;
      state.firstWorldReady = true;
      capture('iw_world_preview_ready', {
        journey: journey(),
        step: info.current,
        totalSteps: info.total,
        detailStage: data.detailStage,
        detailProgress: data.detailProgress,
        firstWorldVisibleMs: wasFirst ? undefined : Math.round(performance.now() - state.startedAt)
      });
    } catch (error) {
      if (serial !== state.requestSerial) return;
      if (state.status) state.status.textContent = 'Живой preview пока недоступен. Разговор продолжится без потери ответов; мир попробует восстановиться на следующем шаге.';
      capture('iw_world_preview_error', { journey: journey(), step: info.current, message: String(error?.message || 'preview error').slice(0, 120) });
    }
  }

  function observeWizard(){
    const count = $('count');
    const question = $('question');
    if (!count || !question) return;
    const observer = new MutationObserver(() => {
      updateNavigatorEcho();
      setTimeout(() => refreshPreview('step-change'), 0);
    });
    observer.observe(count, { childList: true, characterData: true, subtree: true });
    observer.observe(question, { childList: true, characterData: true, subtree: true });

    document.addEventListener('click', (event) => {
      const id = event.target?.id;
      if (id === 'skip') {
        const info = stepInfo();
        capture('iw_question_skipped', { journey: journey(), step: info.current, totalSteps: info.total });
      }
      if (id === 'next') {
        const info = stepInfo();
        capture('iw_question_advanced', Object.assign({ journey: journey(), step: info.current, totalSteps: info.total }, answerMetrics(readDraft())));
      }
    }, true);
  }

  async function init(){
    injectStyle();
    await loadPolicy();
    ensureWizardEnhancement();
    observeWizard();
    showIntro();
    if ($('wizard') && !$('wizard').classList.contains('hide')) refreshPreview('resume');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
