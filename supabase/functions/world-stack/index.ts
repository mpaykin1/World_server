import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
const loreBible = {"worlds":{"voxel-world":{"headline":"КТО ПОЛОЖИЛ ПЕРВЫЙ КУБ — И ПОЧЕМУ ОН ДО СИХ ПОР ПОЁТ?","connections":[{"targetId":"world-sharabass","story":"Семь древних блоков отвечают той же последовательностью нот, которой когда-то говорил Шарабас."}]},"ai3d-voxel-city":{"headline":"КАЖДУЮ НОЧЬ ЭТОТ ГОРОД ПЕРЕСТРАИВАЕТ СЕБЯ — НО ДЛЯ КОГО?","connections":[{"targetId":"voxel-world","story":"План улиц продолжает координатный узор, начатый возле Первого Куба."}]},"survival":{"headline":"КАЖДОЕ УТРО ЗДЕСЬ ПОЯВЛЯЮТСЯ СЛЕДЫ ТОГО, КТО ЕЩЁ НЕ ПРИШЁЛ","connections":[{"targetId":"dark-void-navigator-live","story":"В почти погасших углях появляется тот же одинокий свет, с которого начинается Dark Void."}]},"world-sharabass":{"headline":"ТАМ, ГДЕ МУЗЫКА УМЕЛА ОТВЕЧАТЬ","connections":[{"targetId":"voxel-world","story":"Семь нот Шарабаса заставляют древние блоки Voxel World светиться и менять положение."},{"targetId":"dark-void-navigator-live","story":"В полной темноте ноты превращаются в семь огней Навигатора."}]},"dark-void-navigator-live":{"headline":"В ТЕМНОТЕ ЕСТЬ ДВЕРЬ БЕЗ СТЕН — И ОНА ОТВЕЧАЕТ НА ВОПРОСЫ","connections":[{"targetId":"world-sharabass","story":"Семь огней складываются в Начальную Фразу музыкального языка Шарабаса."},{"targetId":"improve-world-home-live","story":"Дверь без стен иногда открывается прямо в коридор Дома историй."}]},"improve-world-home-live":{"headline":"ЭТОТ ДОМ ДОСТРАИВАЕТ КОМНАТУ КАЖДЫЙ РАЗ, КОГДА ЕМУ РАССКАЗЫВАЮТ ИСТОРИЮ","connections":[{"targetId":"world-server-catalog-live","story":"Карта Дверей стала первым планом Каталога, но на ней есть проход, которого нет ни в одном списке."},{"targetId":"improve-world-experiment-100","story":"Одна дверь ведёт в Лабораторию 100, где истории временно превращают в законы физики."}]},"improve-world-experiment-100":{"headline":"ЛАБОРАТОРИЯ №100 СКРЫВАЕТ ЭКСПЕРИМЕНТ №101 — И В НЁМ УЖЕ ЕСТЬ УЧАСТНИК","connections":[{"targetId":"improve-world-home-live","story":"Истории из Дома приходят сюда как гипотезы и иногда возвращаются способными менять реальность."}]},"voxel-gothic-steampunk-world":{"headline":"ТРИДЦАТЬ ЛЕТ ЧАСЫ БИЛИ ДВЕНАДЦАТЬ РАЗ. ПРОШЛОЙ НОЧЬЮ РАЗДАЛСЯ ТРИНАДЦАТЫЙ УДАР","connections":[{"targetId":"world-sharabass","story":"В Сердечном Двигателе хранится металлический цилиндр с утраченной частью Песни Шарабаса."},{"targetId":"gothic-voxel-city-atlas-v3-mobile-final","story":"Атлас показывает район за несколько минут до тринадцатого удара."}]},"gothic-voxel-city-atlas-v3-mobile-final":{"headline":"ЭТА КАРТА РИСУЕТ УЛИЦЫ ЗА ДЕНЬ ДО ТОГО, КАК ИХ ПОСТРОЯТ","connections":[{"targetId":"voxel-gothic-steampunk-world","story":"Все красные линии сходятся к Сердечному Двигателю перед тринадцатым ударом."}]},"voxel-gothic-steampunk-mobile-repaired":{"headline":"КОГДА ГОРОД НАЧАЛ СКЛАДЫВАТЬСЯ, ИНЖЕНЕРЫ СПРЯТАЛИ ЕГО В МИРЕ РАЗМЕРОМ С ЛАДОНЬ","connections":[{"targetId":"voxel-gothic-steampunk-world","story":"Исчезнувшие кварталы большого города появляются здесь в уменьшенном виде после тринадцатого удара."}]},"world-server-codex-voxel-v3":{"headline":"СТАРЫЙ МИР НЕ УДАЛИЛСЯ — ОН ПРОДОЛЖАЕТ ЖИТЬ ПОД НОВЫМ","connections":[{"targetId":"voxel-world","story":"Фантомные Кубы указывают координаты Первого Куба, но точка отсутствует на нынешней карте."}]},"cinematic-encounter":{"headline":"ЧТО МЕЛЬКНУЛО В ПЫЛИ В МОМЕНТ ВСПЫШКИ — И ПОЧЕМУ ОНО ИДЁТ ПО СЛЕДУ ИГРОКА?","connections":[{"targetId":"voxel-world","story":"Последняя цепочка следов уходит за промышленную дорогу в бесконечный Voxel World, где те же четыре отметины появляются на древних блоках."}]},"world-server-catalog-live":{"headline":"МЕЖДУ МИРАМИ ЕСТЬ ВОКЗАЛ С ТРИНАДЦАТОЙ ДВЕРЬЮ, КОТОРОЙ НЕТ НИ НА ОДНОЙ КАРТЕ","connections":[{"targetId":"improve-world-home-live","story":"Карта Дверей из Дома не показывает тринадцатый проход, хотя остальные двери на ней есть."},{"targetId":"world-sharabass","story":"Один из замков открывается только правильной нотой Песни Шарабаса."}]}}} as const;

const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THEMES = ["forest", "mountains", "islands", "desert", "snow", "gothic", "steampunk", "ruins"];
const encoder = new TextEncoder();

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
async function bodyJson(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
function validUuid(value: unknown) { return REQUEST_ID.test(String(value || "")); }
function cleanIdea(value: unknown) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}
function cleanSummary(value: unknown) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!text) fail(400, "Canon event summary is required.");
  return text;
}
async function sha256Hex(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safePayload(value: unknown) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value as Record<string, unknown>) : {};
  if (encoder.encode(JSON.stringify(payload)).length > 7000) fail(413, "Canon payload is too large.");
  return payload as Record<string, unknown>;
}
function pickTheme(idea: string, hex: string) {
  const text = idea.toLocaleLowerCase("ru-RU");
  const rules: Array<[RegExp, string]> = [
    [/лес|forest|джунг|jungle/, "forest"], [/гор|mountain|скал|rock/, "mountains"],
    [/остров|island|океан|ocean|мор|sea/, "islands"], [/пустын|desert|песок|sand/, "desert"],
    [/снег|snow|лед|ice/, "snow"], [/гот|goth/, "gothic"], [/стим|steam|шестер|gear/, "steampunk"],
    [/руин|ruin|древн|ancient/, "ruins"]
  ];
  for (const [pattern, theme] of rules) if (pattern.test(text)) return theme;
  return THEMES[parseInt(hex.slice(0, 8), 16) % THEMES.length];
}
function publicWorld(row: any) {
  const dna = row?.settings?.worldDNA;
  if (!dna || dna.generator?.kind !== "procedural-voxel") return null;
  return {
    id: row.id,
    title: row.settings?.name || dna.title || row.id,
    seed: Number(row.seed),
    theme: row.settings?.theme || dna.theme || "forest",
    lore: row.settings?.lore || dna.lore || null,
    worldDNA: dna,
    playUrl: `/apps/voxel-world/?world=${encodeURIComponent(row.id)}`
  };
}
function bearer(req: Request) {
  const match = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}
async function optionalIdentity(admin: any, req: Request, body: any) {
  const token = bearer(req);
  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data?.user) return { kind: "user", id: data.user.id };
  }
  const guestId = String(body?.guestId || body?.guest_id || "");
  if (!validUuid(guestId)) fail(400, "Не удалось определить игровую сессию гостя.");
  return { kind: "guest", id: guestId };
}
async function worldDNA(ideaRaw: unknown, requestIdRaw: unknown) {
  const idea = cleanIdea(ideaRaw);
  const requestId = String(requestIdRaw || "");
  if (idea.length < 3) fail(400, "Опишите мир хотя бы тремя символами.");
  if (!validUuid(requestId)) fail(400, "requestId must be a UUID");
  const requestHash = await sha256Hex(requestId);
  const id = `world-${requestHash.slice(0, 16)}`;
  const hex = await sha256Hex(`${requestId}\n${idea}`);
  const seed = (parseInt(hex.slice(0, 8), 16) & 0x7fffffff) || 1;
  const theme = pickTheme(idea, hex);
  const ids = Object.keys((loreBible as any)?.worlds || {}).filter((x) => WORLD_ID.test(x) && x !== id).sort();
  const anchorId = ids.length ? ids[parseInt((await sha256Hex(id)).slice(0, 8), 16) % ids.length] : null;
  const title = cleanIdea(idea.split(/[.!?]/)[0]).slice(0, 64) || "Новый мир";
  const anchorTitle = anchorId ? String((loreBible as any).worlds?.[anchorId]?.headline || anchorId).slice(0, 90) : "";
  const lore = {
    headline: `${title}: новая глава общей вселенной`,
    lore: `Мир родился из идеи игрока: «${idea}». Здесь есть тайна, опасность, цель и выбор. Действия игроков могут менять общий канон.`,
    history: "Мир создан World Factory и сразу подключён к общей истории World_server.",
    elements: ["mystery","puzzle","danger","goal","worldRule","stakes","entity","choice","twist","connection","gameplayHook","openQuestion"],
    connections: anchorId ? [{ targetId: anchorId, story: `В этом мире обнаружен след, связанный с миром «${anchorTitle}». Игроки могут изменить смысл этой связи своими действиями.` }] : [],
    generated: true,
    generator: "world-factory-edge-v1"
  };
  return {
    schemaVersion: "1.0.0", id, requestId, title, idea, seed, theme,
    generator: { kind: "procedural-voxel", version: 1, chunkSize: 16, minY: -16, maxY: 96 },
    visualProfile: { qualityFloor: 85, atmosphere: true, pbr: true, microdetail: true, water: true, adaptivePerformance: true },
    lore,
    createdAt: new Date().toISOString()
  };
}
function settingsFromDNA(dna: any) {
  return { name: dna.title, chunkSize: 16, minY: -16, maxY: 96, generatorVersion: 1, theme: dna.theme, worldDNA: dna, lore: dna.lore };
}
async function worldFactory(admin: any, req: Request, url: URL) {
  if (req.method === "GET") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (id) {
      const { data, error } = await admin.from("voxel_worlds").select("id,seed,settings,created_at,updated_at").eq("id", id).maybeSingle();
      if (error) throw error;
      const world = publicWorld(data);
      if (!world) fail(404, "Мир не найден.");
      return json({ world, runtime: "supabase-edge" });
    }
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 24));
    const { data, error } = await admin.from("voxel_worlds").select("id,seed,settings,created_at,updated_at").order("created_at", { ascending: false }).limit(Math.max(limit * 2, 50));
    if (error) throw error;
    return json({ worlds: (data || []).map(publicWorld).filter(Boolean).slice(0, limit), runtime: "supabase-edge" });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await bodyJson(req);
  await optionalIdentity(admin, req, body);
  if (String(body.action || "create") !== "create") fail(400, "Неизвестное действие World Factory.");
  const dna = await worldDNA(body.idea, body.requestId);
  const { data: existing, error: readError } = await admin.from("voxel_worlds").select("id,seed,settings,created_at,updated_at").eq("id", dna.id).maybeSingle();
  if (readError) throw readError;
  if (existing) return json({ world: publicWorld(existing), created: false, idempotent: true, runtime: "supabase-edge" });
  const { data, error } = await admin.from("voxel_worlds").insert({ id: dna.id, seed: dna.seed, settings: settingsFromDNA(dna) }).select("id,seed,settings,created_at,updated_at").single();
  if (error) {
    if ((error as any).code === "23505") {
      const { data: raced } = await admin.from("voxel_worlds").select("id,seed,settings,created_at,updated_at").eq("id", dna.id).maybeSingle();
      if (raced) return json({ world: publicWorld(raced), created: false, idempotent: true, runtime: "supabase-edge" });
    }
    throw error;
  }
  return json({ world: publicWorld(data), created: true, idempotent: false, runtime: "supabase-edge" }, 201);
}
function cleanWorldId(value: unknown) {
  const id = String(value || "").trim();
  if (!WORLD_ID.test(id)) fail(400, "Invalid canon world id.");
  return id;
}
function cleanEventType(value: unknown) {
  const type = String(value || "").trim().toLowerCase().slice(0, 64);
  if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(type)) fail(400, "Invalid canon event type.");
  return type;
}
async function canonEffect(eventKey: string, sourceWorldId: string, targetWorldId: string) {
  const key = await sha256Hex(`${eventKey}\n${sourceWorldId}\n${targetWorldId}`);
  const unit = (offset: number) => parseInt(key.slice(offset, offset + 8), 16) / 0xffffffff;
  return { schemaVersion: 1, kind: "canon_beacon", effectId: `canon-${key.slice(0, 16)}`, hue: Math.round(unit(0) * 359), radius: Number((4 + unit(8) * 5).toFixed(2)), intensity: Number((0.7 + unit(16) * .55).toFixed(2)), lifetimeMs: 86400000 };
}
async function canonRecord(admin: any, req: Request, body: any) {
  await optionalIdentity(admin, req, body);
  const worldId = cleanWorldId(body.worldId);
  const eventType = cleanEventType(body.eventType);
  const summary = cleanSummary(body.summary);
  const payload = safePayload(body.payload);
  const idempotencyKey = String(body.idempotencyKey || "").trim().slice(0, 180);
  if (!idempotencyKey) fail(400, "Canon idempotency key is required.");
  const eventKey = await sha256Hex(`${worldId}\n${eventType}\n${idempotencyKey}`);
  const { data: world, error: worldError } = await admin.from("voxel_worlds").select("settings").eq("id", worldId).maybeSingle();
  if (worldError) throw worldError;
  const alias = worldId === "main" ? "voxel-world" : worldId;
  const lore = world?.settings?.lore || world?.settings?.worldDNA?.lore || (loreBible as any)?.worlds?.[alias] || null;
  const source = { event_key: eventKey, world_id: worldId, event_type: eventType, summary, payload, cause_event_key: null, source_world_id: worldId, target_world_id: worldId };
  const seen = new Set<string>();
  const consequences: any[] = [];
  for (const connection of Array.isArray(lore?.connections) ? lore.connections : []) {
    const targetId = String(connection?.targetId || "").trim();
    if (!WORLD_ID.test(targetId) || targetId === worldId || seen.has(targetId)) continue;
    seen.add(targetId);
    const story = cleanSummary(connection.story || `Событие в ${worldId} отозвалось в ${targetId}.`);
    const consequenceKey = await sha256Hex(`${eventKey}\n${targetId}`);
    consequences.push({
      event_key: consequenceKey, world_id: targetId, event_type: "cross_world_consequence",
      summary: `Последствие из «${worldId}»: ${story}`.slice(0, 500),
      payload: { causeWorldId: worldId, causeEventType: eventType, story, effect: await canonEffect(eventKey, worldId, targetId) },
      cause_event_key: eventKey, source_world_id: worldId, target_world_id: targetId
    });
    if (consequences.length >= 4) break;
  }
  const rows = [source, ...consequences];
  const { data, error } = await admin.from("world_canon_events").upsert(rows, { onConflict: "event_key" }).select("event_key,world_id,event_type,summary,payload,cause_event_key,source_world_id,target_world_id,created_at");
  if (error) throw error;
  return json({ event: source, consequences, persisted: data || [], runtime: "supabase-edge" });
}
async function canon(admin: any, req: Request, url: URL) {
  if (req.method === "GET") {
    const worldId = cleanWorldId(url.searchParams.get("worldId"));
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
    const { data, error } = await admin.from("world_canon_events").select("event_key,world_id,event_type,summary,payload,cause_event_key,source_world_id,target_world_id,created_at").eq("world_id", worldId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return json({ events: data || [], runtime: "supabase-edge" });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await bodyJson(req);
  if (String(body.action || "record") !== "record") fail(400, "Неизвестное действие канона.");
  return canonRecord(admin, req, body);
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) return json({ error: "Supabase runtime is not configured." }, 503);
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
    const url = new URL(req.url);
    const deployment = url.pathname.split("/").filter(Boolean).at(-1) || "";
    const writeMode = deployment.endsWith("-write");
    if (writeMode && req.method === "GET") return json({ error: "Read through world-stack-read." }, 405);
    if (!writeMode && req.method !== "GET") return json({ error: "Writes require authenticated world-stack-write." }, 405);
    const route = String(url.searchParams.get("route") || "");
    if (route === "world-factory") return await worldFactory(admin, req, url);
    if (route === "canon") return await canon(admin, req, url);
    return json({ error: "Unknown world-stack route." }, 404);
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    console.error("[world-stack]", error);
    return json({ error: status >= 500 ? "World stack backend error." : String((error as any)?.message || error) }, status);
  }
});
