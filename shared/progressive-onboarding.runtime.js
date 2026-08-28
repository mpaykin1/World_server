(() => {
  "use strict";

  const VERSION = "1.0.0";
  const STORAGE_KEY = "improveworld.progressiveOnboarding.v1";
  const bypass = new WeakSet();
  let active = null;

  const POLICY = {
    maxQuestions: 3,
    create: [
      { id: "world", prompt: "Какой мир ты сейчас представляешь?", completion: 12,
        suggestions: ["Ночной город", "Лес", "Дом", "Пустое пространство", "Что-то странное"] },
      { id: "focus", prompt: "Кто или что в нём главное?", completion: 20,
        suggestions: ["Я", "Другой человек", "Существо", "Место", "Предмет"] },
      { id: "desire", prompt: "Чего оно хочет?", completion: 27,
        suggestions: ["Найти", "Уйти", "Изменить", "Сохранить", "Понять"] }
    ],
    join: [
      { id: "association", prompt: "Что первым приходит в голову, когда ты смотришь на этот мир?", completion: 12,
        suggestions: ["Интерес", "Тревога", "Спокойствие", "Странность", "Любопытство"] },
      { id: "focus", prompt: "Кто или что здесь для тебя главное?", completion: 20,
        suggestions: ["Персонаж", "Место", "Событие", "Предмет", "Я сам"] },
      { id: "desire", prompt: "Чего тебе хочется, чтобы здесь произошло?", completion: 27,
        suggestions: ["Встреча", "Перемена", "Открытие", "Путешествие", "Неожиданность"] }
    ]
  };

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
    try {
      if (window.posthog?.capture) window.posthog.capture(name.replace("improveworld:", "iw_"), detail);
    } catch (_) {}
  }

  function loadDraft() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); }
    catch (_) { return null; }
  }
  function saveDraft(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        flow: state.flow, index: state.index, answers: state.answers, updatedAt: Date.now()
      }));
    } catch (_) {}
  }
  function hashText(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seeded(seed) {
    let t = seed || 1;
    return () => {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ x >>> 15, x | 1);
      x ^= x + Math.imul(x ^ x >>> 7, x | 61);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }

  function paintSeed(canvas, answers, animate = false) {
    if (!canvas) return;
    const reduce = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width * dpr));
    const h = Math.max(150, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const text = Object.values(answers).map(v => v?.value || "").join("|") || "improve-world";
    const seed = hashText(text);
    const rnd = seeded(seed);
    const hueA = seed % 360;
    const hueB = (hueA + 55 + (seed % 110)) % 360;
    const dots = Array.from({length: 28}, () => ({
      x:rnd(), y:rnd(), r:0.02 + rnd()*0.12, a:0.10+rnd()*0.36, s:0.3+rnd()*1.2
    }));
    let raf = 0;
    const started = performance.now();

    function frame(now) {
      const t = (now - started) / 1000;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${hueA} 52% 13%)`);
      g.addColorStop(1, `hsl(${hueB} 58% 7%)`);
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

      for (let i=0; i<dots.length; i++) {
        const p = dots[i];
        const drift = (!reduce && animate) ? Math.sin(t*p.s+i)*0.018 : 0;
        const x=(p.x+drift)*w, y=(p.y+drift*0.45)*h;
        const rg=ctx.createRadialGradient(x,y,0,x,y,p.r*w);
        rg.addColorStop(0, `hsla(${(hueA+i*13)%360} 80% 72% / ${p.a})`);
        rg.addColorStop(1, `hsla(${hueB} 80% 40% / 0)`);
        ctx.fillStyle=rg; ctx.fillRect(x-p.r*w,y-p.r*w,p.r*w*2,p.r*w*2);
      }

      const filled = Object.keys(answers).length;
      ctx.globalAlpha = 0.18 + filled*0.08;
      ctx.strokeStyle = `hsl(${(hueA+180)%360} 45% 76%)`;
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      const layers = 4 + filled*2;
      for (let i=0;i<layers;i++){
        const yy=h*(0.48+i*0.055);
        ctx.moveTo(0,yy);
        for(let x=0;x<=w;x+=w/16){
          ctx.lineTo(x, yy + Math.sin((x/w)*7 + i + seed*0.00001)*(8+i*2)*dpr);
        }
      }
      ctx.stroke();
      ctx.globalAlpha=1;

      if (animate && !reduce) raf=requestAnimationFrame(frame);
    }
    frame(performance.now());
    return () => cancelAnimationFrame(raf);
  }

  function button(label, cls="", attrs={}) {
    const el=document.createElement("button");
    el.type="button"; el.className=`iw-po-btn ${cls}`.trim(); el.textContent=label;
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    return el;
  }

  function recognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function startSpeech(textarea, onDone) {
    const Ctor=window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    const r=new Ctor(); r.lang=document.documentElement.lang || "ru-RU"; r.interimResults=true; r.continuous=false;
    r.onresult=(e)=>{
      let text="";
      for(let i=e.resultIndex;i<e.results.length;i++) text += e.results[i][0].transcript;
      textarea.value=text.trim();
      textarea.dispatchEvent(new Event("input",{bubbles:true}));
    };
    r.onerror=()=>{};
    r.onend=()=>onDone?.();
    r.start();
    return r;
  }

  function getCurrentQuestions(state) { return POLICY[state.flow] || POLICY.create; }

  function createShell(state) {
    const overlay=document.createElement("section");
    overlay.className="iw-po-overlay";
    overlay.setAttribute("role","dialog");
    overlay.setAttribute("aria-modal","true");
    overlay.dataset.iwProgressiveOnboarding=VERSION;

    const card=document.createElement("div");
    card.className="iw-po-card";
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    state.overlay=overlay; state.card=card;
    return {overlay, card};
  }

  function updateLiveSeed(state) {
    const canvas=state.card?.querySelector(".iw-po-live-seed canvas");
    if (canvas) paintSeed(canvas,state.answers,false);
  }

  function answerCurrent(state, value, skipped=false) {
    const q=getCurrentQuestions(state)[state.index];
    state.answers[q.id]={ value:(value||"").trim(), skipped:!!skipped, at:Date.now() };
    emit("improveworld:onboarding-answer", {
      flow:state.flow, questionId:q.id, value:state.answers[q.id].value, skipped:!!skipped,
      answers:state.answers, completion:q.completion
    });
    state.index += 1; saveDraft(state);
    if (state.index >= Math.min(POLICY.maxQuestions,getCurrentQuestions(state).length)) showSnapshot(state);
    else renderQuestion(state);
  }

  function renderQuestion(state) {
    const q=getCurrentQuestions(state)[state.index];
    if (!q) return showSnapshot(state);
    state.card.innerHTML="";
    const kicker=document.createElement("div"); kicker.className="iw-po-kicker";
    kicker.textContent = state.flow==="join" ? "Твой след в общем мире" : "Первый слепок";
    const progress=document.createElement("div"); progress.className="iw-po-progress";
    const pLabel=document.createElement("div"); pLabel.className="iw-po-progress-label";
    const span1=document.createElement("span"); span1.textContent="Мир проявился";
    const span2=document.createElement("strong"); span2.textContent=`${Math.max(4, state.index ? getCurrentQuestions(state)[state.index-1].completion : 4)}%`;
    pLabel.append(span1,span2);
    const bar=document.createElement("div"); bar.className="iw-po-bar";
    const bi=document.createElement("i"); bi.style.width=span2.textContent; bar.appendChild(bi);
    progress.append(pLabel,bar);

    const seedWrap=document.createElement("div"); seedWrap.className="iw-po-live-seed";
    const canvas=document.createElement("canvas"); canvas.setAttribute("aria-hidden","true"); seedWrap.appendChild(canvas);
    const title=document.createElement("h1"); title.className="iw-po-question"; title.textContent=q.prompt;
    const input=document.createElement("textarea"); input.className="iw-po-input"; input.rows=3;
    input.placeholder="Несколько слов достаточно…"; input.autocomplete="off";
    const prior=state.answers[q.id]?.value; if(prior) input.value=prior;

    const chips=document.createElement("div"); chips.className="iw-po-suggestions";
    q.suggestions.forEach(s=>{
      const c=document.createElement("button"); c.type="button"; c.className="iw-po-chip"; c.textContent=s;
      c.onclick=()=>{ input.value=s; input.dispatchEvent(new Event("input",{bubbles:true})); };
      chips.appendChild(c);
    });

    const actions=document.createElement("div"); actions.className="iw-po-actions";
    if (recognitionSupported()) {
      const voice=button("🎤 Сказать");
      voice.onclick=()=>{
        voice.disabled=true; voice.textContent="Слушаю…";
        startSpeech(input,()=>{voice.disabled=false; voice.textContent="🎤 Сказать";});
      };
      actions.appendChild(voice);
    }
    const skip=button("Пропустить");
    skip.onclick=()=>answerCurrent(state,"",true);
    const next=button(state.index===2 ? "Показать мир" : "Дальше","iw-po-primary");
    next.onclick=()=>answerCurrent(state,input.value,false);
    actions.append(skip,next);

    state.card.append(kicker,progress,seedWrap,title,input,chips,actions);
    requestAnimationFrame(()=>{ updateLiveSeed(state); input.focus({preventScroll:true}); });
    input.addEventListener("input",()=> {
      const qnow=getCurrentQuestions(state)[state.index];
      const transient={...state.answers,[qnow.id]:{value:input.value,skipped:false}};
      paintSeed(canvas,transient,false);
    });
  }

  function handoffToOriginal(state, mode) {
    const trigger=state.originalTrigger;
    close(state);
    emit(`improveworld:${mode}`, { flow:state.flow, answers:state.answers });
    if (trigger && trigger.isConnected) {
      bypass.add(trigger);
      queueMicrotask(()=>trigger.click());
    }
  }

  function showSnapshot(state) {
    state.card.innerHTML="";
    const kicker=document.createElement("div"); kicker.className="iw-po-kicker"; kicker.textContent="Первый слепок готов";
    const seed=document.createElement("div"); seed.className="iw-po-seed";
    const canvas=document.createElement("canvas"); seed.appendChild(canvas);
    const title=document.createElement("h1"); title.className="iw-po-snapshot-title";
    title.textContent=state.flow==="join" ? "Твой след уже появился в этом мире." : "Твой мир уже начал проявляться.";
    const copy=document.createElement("p"); copy.className="iw-po-snapshot-copy";
    copy.textContent="Это ещё не окончательная версия. Можно войти сейчас или постепенно сделать слепок точнее — без длинной анкеты перед входом.";
    const actions=document.createElement("div"); actions.className="iw-po-snapshot-actions";
    const enter=button("Войти сейчас","iw-po-primary");
    enter.dataset.iwAction="enter-now";
    enter.onclick=()=>handoffToOriginal(state,"enter-now");
    const clarify=button("Уточнить мир");
    clarify.dataset.iwAction="clarify-world";
    clarify.onclick=()=>handoffToOriginal(state,"clarify-world");
    const connect=button("Соединить с другим миром");
    connect.dataset.iwAction="connect-worlds";
    connect.onclick=()=> {
      emit("improveworld:connect-worlds",{flow:state.flow,answers:state.answers});
      const candidate=[...document.querySelectorAll("button,a")].find(el=>/соединить.+(мир|истори)/i.test(el.textContent||""));
      close(state);
      if(candidate){ bypass.add(candidate); queueMicrotask(()=>candidate.click()); }
    };
    actions.append(enter,clarify,connect);
    state.card.append(kicker,seed,title,copy,actions);
    requestAnimationFrame(()=>paintSeed(canvas,state.answers,true));
    emit("improveworld:first-snapshot-ready",{ flow:state.flow, answers:state.answers, completion:27, version:VERSION });
  }

  function close(state) {
    if (!state) return;
    state.overlay?.remove();
    if (active===state) active=null;
  }

  function start(flow="create", originalTrigger=null) {
    if (active) close(active);
    const draft=loadDraft();
    const state={
      flow,
      index:(draft?.flow===flow ? Math.min(draft.index||0,2) : 0),
      answers:(draft?.flow===flow && draft.answers ? draft.answers : {}),
      originalTrigger
    };
    createShell(state); active=state;
    emit("improveworld:onboarding-opened",{flow,version:VERSION});
    renderQuestion(state);
    return state;
  }

  function classifyTrigger(el) {
    const text=(el.textContent||"").trim().toLowerCase();
    const action=(el.getAttribute("data-action")||"").toLowerCase();
    const href=(el.getAttribute("href")||"").toLowerCase();
    if (/присоедин|join/.test(text+" "+action+" "+href)) return "join";
    if (/созда(ть|й)|create|начать/.test(text+" "+action+" "+href)) return "create";
    return null;
  }

  function installInterceptors(root=document) {
    root.addEventListener("click",(event)=>{
      const el=event.target?.closest?.("button,a,[role=button]");
      if(!el || bypass.has(el)) { if(el) bypass.delete(el); return; }
      if(el.closest(".iw-po-overlay")) return;
      const flow=classifyTrigger(el);
      if(!flow) return;
      if(el.dataset.iwProgressiveIgnore==="true") return;
      event.preventDefault(); event.stopImmediatePropagation();
      start(flow,el);
    },true);
  }

  function boot(options={}) {
    if (window.__IW_PROGRESSIVE_ONBOARDING_BOOTED__) return window.ImproveWorldProgressiveOnboarding;
    window.__IW_PROGRESSIVE_ONBOARDING_BOOTED__=VERSION;
    installInterceptors(options.root || document);
    return window.ImproveWorldProgressiveOnboarding;
  }

  window.ImproveWorldProgressiveOnboarding = {
    VERSION, boot, start, close:()=>close(active), policy:POLICY
  };

  if (document.readyState==="loading") {
    document.addEventListener("DOMContentLoaded",()=>boot(),{once:true});
  } else boot();
})();
