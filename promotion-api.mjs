import { buildEmailDraft, scoreProspect, decisionMakerRoles, validateCampaignId, normalizeLanguage } from './lib/promotion-engine.mjs';

function response(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status === 200 ? 'no-store' : 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  }});
}

function trim(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function profile(env, requestUrl) {
  const url = new URL('/data/promotion-theater.json', requestUrl);
  const result = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
  if (!result.ok) throw new Error('PROFILE_NOT_FOUND');
  return result.json();
}

function findCampaign(data, id) {
  const safe = validateCampaignId(id);
  return safe ? data.campaigns.find(c => c.id === safe) : null;
}

function parseAiJson(raw) {
  const text = String(raw || '').trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  try { return JSON.parse(text); } catch {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('AI_INVALID_JSON');
    return JSON.parse(text.slice(a, b + 1));
  }
}

async function aiDraft(env, deterministic, campaign, prospect, role, language) {
  if (!env.AI) return null;
  const evidence = prospect.publicFact && prospect.sourceUrl
    ? { public_fact: trim(prospect.publicFact, 360), source_url: trim(prospect.sourceUrl, 500) }
    : null;
  const system = language === 'en'
    ? 'You write concise ethical B2B outreach for Mikhail Paykin in Tbilisi. Use only supplied facts. Never invent clients, employee counts, budgets, relationships, achievements, pain, private emails or personal details. Do not imply medical treatment. If evidence is absent, write generic relevance rather than fake personalization. Output JSON only: {"subject":"...","body":"..."}. Body <= 170 words. Ask for a low-pressure next step. Do not include tracking tricks or urgency.'
    : 'Ты пишешь короткие этичные B2B-письма для Михаила Пайкина в Тбилиси. Используй только переданные факты. Не выдумывай клиентов, численность сотрудников, бюджеты, связи, достижения, боли, личные email или персональные детали. Не обещай лечение. Если факта для персонализации нет, пиши о релевантности честно и без притворства. Ответ только JSON: {"subject":"...","body":"..."}. Письмо <= 170 слов. Предложи спокойный следующий шаг без давления и искусственной срочности.';
  const payload = {
    language,
    company: trim(prospect.company, 100),
    role: trim(role, 100),
    sector: trim(prospect.sector, 120),
    location: trim(prospect.location, 100),
    evidence,
    campaign: {
      label: campaign.label?.[language] || campaign.label?.ru,
      pain: campaign.pain?.[language] || campaign.pain?.ru,
      offer: campaign.offer?.[language] || campaign.offer?.ru
    },
    baseline: deterministic
  };
  const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
    messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
    temperature: 0.25,
    max_tokens: 650
  });
  const parsed = parseAiJson(out?.response || out?.choices?.[0]?.message?.content || '');
  const subject = trim(parsed.subject, 120);
  const body = String(parsed.body || '').trim().slice(0, 1800);
  if (!subject || !body) throw new Error('AI_EMPTY_DRAFT');
  return { subject, body, language, evidenceUsed: Boolean(evidence), humanReviewRequired: true, autoSendAllowed: false, aiEnhanced: true };
}

export async function handlePromotionApi(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'GET, POST, OPTIONS' } });
  const url = new URL(request.url);
  let data;
  try { data = await profile(env, url); }
  catch { return response({ ok: false, error: 'profile_unavailable' }, 503); }

  if (request.method === 'GET') {
    return response({ ok: true, profile: data, capabilities: {
      deterministicScoring: true,
      bilingualDrafts: true,
      workersAiDrafts: Boolean(env.AI),
      autoSend: false,
      privateDataScraping: false
    }});
  }
  if (request.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405, { allow: 'GET, POST, OPTIONS' });
  if (Number(request.headers.get('content-length') || 0) > 12000) return response({ ok: false, error: 'request_too_large' }, 413);

  let body;
  try { body = await request.json(); } catch { return response({ ok: false, error: 'invalid_json' }, 400); }
  const campaign = findCampaign(data, body?.campaignId);
  if (!campaign) return response({ ok: false, error: 'invalid_campaign' }, 400);
  const prospect = {
    company: trim(body?.prospect?.company, 100),
    location: trim(body?.prospect?.location, 100),
    sector: trim(body?.prospect?.sector, 120),
    publicFact: trim(body?.prospect?.publicFact, 360),
    sourceUrl: trim(body?.prospect?.sourceUrl, 500),
    needSignals: Array.isArray(body?.prospect?.needSignals) ? body.prospect.needSignals.slice(0, 8).map(x => trim(x, 100)) : [],
    optOut: body?.prospect?.optOut === true
  };
  if (!prospect.company) return response({ ok: false, error: 'company_required' }, 400);
  if (prospect.sourceUrl && !/^https:\/\//i.test(prospect.sourceUrl)) return response({ ok: false, error: 'source_url_must_be_https' }, 400);
  const operation = body?.operation === 'draft' ? 'draft' : 'score';
  const scoring = scoreProspect(campaign, prospect);
  const roles = decisionMakerRoles(campaign.id);
  if (operation === 'score') return response({ ok: true, campaignId: campaign.id, scoring, decisionMakerRoles: roles });

  const language = normalizeLanguage(body?.language);
  const role = trim(body?.role, 100) || roles[0] || '';
  const deterministic = buildEmailDraft({ language, campaign, prospect, role });
  let draft = deterministic;
  let provider = 'deterministic';
  if (body?.ai === true && env.AI && prospect.optOut !== true) {
    if (!env.GAME_AI_RATE_LIMIT) return response({ ok: false, error: 'rate_limiter_unavailable' }, 503);
    const allowed = await env.GAME_AI_RATE_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'anonymous' });
    if (!allowed.success) return response({ ok: false, error: 'rate_limited' }, 429);
    try {
      const improved = await aiDraft(env, deterministic, campaign, prospect, role, language);
      if (improved) { draft = improved; provider = 'cloudflare-ai'; }
    } catch {
      provider = 'deterministic-fallback';
    }
  }
  return response({ ok: true, campaignId: campaign.id, scoring, decisionMakerRoles: roles, draft, provider,
    safeguards: { humanReviewRequired: true, autoSendAllowed: false, optOutHonored: prospect.optOut === true }});
}
