import { buildAgentZeroBrief, importEvidence } from '/lib/promotion-engine.mjs';

const state = {
  profile: null,
  campaignId: 'private_workshops',
  prospect: {},
  role: '',
  competitors: [],
  evidence: [],
  feedback: [],
  lastScore: null,
  lastDrafts: {}
};
const q = (s, root = document) => root.querySelector(s);
const qa = (s, root = document) => Array.from(root.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines = (v) => String(v || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 30);

function showStep(n) {
  qa('.step').forEach((b) => b.classList.toggle('active', Number(b.dataset.step) === n));
  qa('.panel').forEach((p) => p.classList.toggle('active', Number(p.dataset.panel) === n));
  location.hash = 'step-' + n;
}
function language() {
  return q('[data-lang].active')?.dataset.lang === 'en' ? 'en' : 'ru';
}
async function loadProfile() {
  const res = await fetch('/api/promotion', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'profile_error');
  state.profile = data.profile;
  renderFacts(); renderCampaigns(); renderRoles(); renderLandings(); renderSeedProspects();
}
function renderFacts() {
  const facts = state.profile?.site?.verifiedFacts || [];
  q('#facts').innerHTML = facts.map((f) =>
    '<article class="card"><small>' + esc(f.id) + '</small><p>' +
    esc(language() === 'en' ? f.factEn : f.factRu) +
    '</p><a href="' + esc(f.source) + '" target="_blank" rel="noopener noreferrer">' + esc(f.source) + '</a></article>'
  ).join('');
}
function renderCampaigns() {
  q('#campaigns').innerHTML = (state.profile?.campaigns || []).map((c) =>
    '<article class="campaign ' + (c.id === state.campaignId ? 'selected' : '') + '" data-campaign="' + esc(c.id) + '">' +
    '<small>' + esc(c.status) + '</small><h3>' + esc(c.label?.[language()] || c.label?.ru) + '</h3>' +
    '<p>' + esc(c.pain?.[language()] || c.pain?.ru) + '</p><p><strong>' + (language() === 'en' ? 'Offer' : 'Предложение') +
    ':</strong> ' + esc(c.offer?.[language()] || c.offer?.ru) + '</p></article>'
  ).join('');
  qa('.campaign').forEach((el) => el.onclick = () => {
    state.campaignId = el.dataset.campaign;
    state.lastScore = null;
    renderCampaigns(); renderRoles(); renderScore();
  });
}
function rolesForCampaign() {
  const map = {
    private_workshops:['HR Manager','Head of People','Learning & Development','People Partner','Founder / CEO'],
    schools_colleges:['School Director','Dean','Student Affairs','Academic Program Lead','Counsellor / Wellbeing Lead'],
    ngo_programs:['Program Director','Community Lead','Partnerships Manager','Training Lead','Executive Director'],
    creative_agencies:['Creative Director','Managing Director','People Lead','Strategy Director','Founder'],
    individuals_change:['Individual participant']
  };
  return state.roles || map[state.campaignId] || [];
}
function renderRoles() {
  q('#roles').innerHTML = rolesForCampaign().map((r) =>
    '<button class="role ' + (state.role === r ? 'selected' : '') + '" data-role="' + esc(r) + '">' + esc(r) + '</button>'
  ).join('');
  qa('.role').forEach((b) => b.onclick = () => {
    state.role = b.dataset.role; q('#role-input').value = state.role; renderRoles();
  });
}
function renderSeedProspects() {
  const box = q('#seed-prospects');
  if (!box) return;
  const rows = state.profile?.seedProspects || [];
  box.innerHTML = rows.map((p) =>
    '<article class="card"><small>' + esc(p.status) + ' · ' + esc(p.observedDate) + '</small><h3>' + esc(p.company) + '</h3>' +
    '<p>' + esc(p.publicFact) + '</p><a href="' + esc(p.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Source →</a>' +
    '<div class="actions"><button class="ghost" data-seed="' + esc(p.id) + '">Load candidate →</button></div></article>'
  ).join('');
  qa('[data-seed]', box).forEach((b) => b.onclick = () => {
    const p = rows.find((x) => x.id === b.dataset.seed);
    if (!p) return;
    state.campaignId = p.campaignId || state.campaignId;
    q('#company').value = p.company || '';
    q('#location').value = p.location || '';
    q('#sector').value = p.sector || '';
    q('#public-fact').value = p.publicFact || '';
    q('#source-url').value = p.sourceUrl || '';
    q('#need-signals').value = '';
    state.lastScore = null; state.roles = null; renderCampaigns(); renderRoles(); renderScore();
  });
}

function readProspect() {
  state.prospect = {
    company:q('#company').value.trim(),
    location:q('#location').value.trim(),
    sector:q('#sector').value.trim(),
    publicFact:q('#public-fact').value.trim(),
    sourceUrl:q('#source-url').value.trim(),
    needSignals:q('#need-signals').value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8),
    optOut:false
  };
  return state.prospect;
}
async function score() {
  const res = await fetch('/api/promotion', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({operation:'score',campaignId:state.campaignId,prospect:readProspect()})
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'score_error');
  state.lastScore = data.scoring; state.roles = data.decisionMakerRoles;
  renderScore(); renderRoles();
}
function renderScore() {
  const s = state.lastScore;
  if (!s) { q('#score-output').innerHTML = ''; return; }
  const cls = s.band === 'high' ? 'score-high' : s.band === 'medium' ? 'score-medium' : 'score-low';
  q('#score-output').innerHTML =
    '<div class="score-number ' + cls + '">' + s.score + '</div><strong>' + esc(s.band.toUpperCase()) + '</strong>' +
    '<p>' + esc(s.reasons.join(' · ')) + '</p><p><small>' + esc(s.cautions.join(' · ')) + '</small></p>' +
    '<p><b>Evidence ready:</b> ' + (s.evidenceReady ? 'YES' : 'NO') + ' · <b>Auto-send:</b> NO</p>';
}
async function draft(lang) {
  const res = await fetch('/api/promotion', {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({
      operation:'draft',campaignId:state.campaignId,prospect:readProspect(),
      role:q('#role-input').value.trim() || state.role,language:lang,ai:q('#ai-draft').checked
    })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || 'draft_error');
  return data;
}
async function generateDrafts() {
  const button = q('#generate-email'); button.disabled = true; button.textContent = '…';
  try {
    const values = await Promise.all([draft('ru'), draft('en')]);
    state.lastDrafts = { ru: values[0], en: values[1] };
    q('#subject-ru').value = values[0].draft.subject; q('#body-ru').value = values[0].draft.body;
    q('#subject-en').value = values[1].draft.subject; q('#body-en').value = values[1].draft.body;
    showStep(6);
  } catch (e) { alert(e.message); }
  finally { button.disabled = false; button.textContent = 'Сгенерировать RU/EN письмо'; }
}
function renderCompetitors() {
  q('#competitor-list').innerHTML = state.competitors.map((c, i) =>
    '<div class="row"><a href="' + esc(c.url) + '" target="_blank" rel="noopener noreferrer">' + esc(c.url) +
    '</a><div><b>Fact</b><br>' + esc(c.fact) + '</div><div><b>Inference</b><br>' + esc(c.inference) +
    '</div><button class="ghost" data-remove="' + i + '">×</button></div>'
  ).join('');
  qa('[data-remove]').forEach((b) => b.onclick = () => { state.competitors.splice(Number(b.dataset.remove), 1); renderCompetitors(); });
}
function makeBrief() {
  q('#agent-brief').value = buildAgentZeroBrief({
    site:state.profile?.site, competitors:lines(q('#agent-competitors').value),
    prospects:lines(q('#agent-prospects').value), language:language()
  });
}
function validateEvidence() {
  const parsed = importEvidence(q('#agent-evidence').value);
  if (!parsed.ok) { q('#evidence-result').textContent = 'Invalid JSON'; return; }
  state.evidence.push(...parsed.items);
  q('#evidence-result').textContent = 'Imported cited facts: ' + parsed.items.length + '; ignored uncited/invalid rows: ' + parsed.ignoredUncited + '.';
}
function renderLandings() {
  const en = language() === 'en';
  const values = en ? [
    ['https://theater.mmmpaykin.workers.dev/en/','English home'],
    ['https://theater.mmmpaykin.workers.dev/en/team-workshops-tbilisi/','Team workshops'],
    ['https://theater.mmmpaykin.workers.dev/en/shows-tbilisi/','Shows']
  ] : [
    ['https://theater.mmmpaykin.workers.dev/','Главная'],
    ['https://theater.mmmpaykin.workers.dev/afisha/','Афиша'],
    ['https://theater.mmmpaykin.workers.dev/druzya-tbilisi/','Деятельная дружба']
  ];
  q('#landing-select').innerHTML = values.map((x) => '<option value="' + esc(x[0]) + '">' + esc(x[1]) + ' — ' + esc(x[0]) + '</option>').join('');
}
function buildUtm() {
  try {
    const u = new URL(q('#landing-select').value);
    [['utm_source',q('#utm-source').value],['utm_medium',q('#utm-medium').value],['utm_campaign',q('#utm-campaign').value]].forEach((x) => {
      if (x[1].trim()) u.searchParams.set(x[0], x[1].trim().slice(0, 80));
    });
    q('#utm-output').innerHTML = '<a href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer">' + esc(u.href) + '</a>';
  } catch { q('#utm-output').textContent = 'Invalid URL'; }
}
function feedback(status) {
  state.feedback.push({status,at:new Date().toISOString(),campaignId:state.campaignId,company:state.prospect.company || null});
  qa('.feedback-grid button').forEach((b) => b.classList.toggle('active', b.dataset.status === status));
  q('#feedback-output').textContent = 'Recorded: ' + status + (status === 'optout' ? ' — do not contact again.' : '.');
}
function exportSession() {
  const blob = new Blob([JSON.stringify({
    version:1,exportedAt:new Date().toISOString(),campaignId:state.campaignId,prospect:state.prospect,
    competitors:state.competitors,evidence:state.evidence,feedback:state.feedback,lastScore:state.lastScore,lastDrafts:state.lastDrafts
  }, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'promotion-session.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

qa('.step').forEach((b) => b.onclick = () => showStep(Number(b.dataset.step)));
qa('[data-lang]').forEach((b) => b.onclick = () => {
  qa('[data-lang]').forEach((x) => x.classList.toggle('active', x === b));
  renderFacts(); renderCampaigns(); renderLandings();
});
q('#refresh-profile').onclick = () => loadProfile().catch((e) => alert(e.message));
q('#make-agent-brief').onclick = makeBrief;
q('#copy-agent-brief').onclick = () => navigator.clipboard.writeText(q('#agent-brief').value);
q('#import-evidence').onclick = validateEvidence;
q('#add-competitor').onclick = () => {
  const url=q('#competitor-url').value.trim(), fact=q('#competitor-fact').value.trim(), inference=q('#competitor-inference').value.trim();
  if (!/^https:\/\//i.test(url) || !fact) { alert('Добавьте HTTPS URL и наблюдаемый факт.'); return; }
  state.competitors.push({url,fact,inference}); renderCompetitors();
};
q('#score-company').onclick = () => score().catch((e) => alert(e.message));
q('#role-input').oninput = () => state.role = q('#role-input').value.trim();
q('#generate-email').onclick = generateDrafts;
qa('.copy-email').forEach((b) => b.onclick = () => {
  const l=b.dataset.copy; navigator.clipboard.writeText(q('#subject-'+l).value+'\n\n'+q('#body-'+l).value);
});
q('#build-utm').onclick = buildUtm;
qa('.feedback-grid button').forEach((b) => b.onclick = () => feedback(b.dataset.status));
q('#export-session').onclick = exportSession;

showStep(1);
loadProfile().catch((e) => { console.error(e); q('#facts').innerHTML = '<article class="card">Profile unavailable</article>'; });
