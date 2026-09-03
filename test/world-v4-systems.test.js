'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const semantic=require('../lib/world-semantic-feedback');
const moderation=require('../lib/world-community-moderation');
const authority=require('../lib/world-player-state-authority');
const live=require('../lib/world-live-translate-token');

function loadIife(rel, extra={}){
  const context={console,ArrayBuffer,Uint8Array,DataView,Float32Array,Float64Array,Int16Array,Math,Date,Map,Set,Promise,crypto:require('crypto').webcrypto,...extra};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(read(rel),context,{filename:rel});
  return context;
}

test('semantic local embedding is deterministic, normalized, and 768-dimensional',()=>{
  const a=semantic.localEmbedding('Joystick movement is broken on iPhone');
  const b=semantic.localEmbedding('Joystick movement is broken on iPhone');
  assert.equal(a.length,768); assert.deepEqual(a,b);
  const norm=Math.sqrt(a.reduce((s,x)=>s+x*x,0)); assert.ok(Math.abs(norm-1)<1e-9);
});

test('semantic clustering groups related feedback more strongly than unrelated text',()=>{
  const a=semantic.localEmbedding('joystick movement broken mobile iphone');
  const b=semantic.localEmbedding('mobile joystick movement does not work iphone');
  const c=semantic.localEmbedding('music volume is too loud');
  assert.ok(semantic.cosine(a,b)>semantic.cosine(a,c));
  const clusters=semantic.greedyCluster([{category:'bug',embedding:a,id:1},{category:'bug',embedding:b,id:2}],{threshold:0.2});
  assert.equal(clusters.length,1); assert.match(clusters[0].key,/^sem:/);
});

test('Gemini semantic contract uses current embedding model and clustering instruction',()=>{
  const s=read('lib/world-semantic-feedback.js');
  assert.match(s,/gemini-embedding-2/); assert.match(s,/task: clustering/); assert.match(s,/outputDimensionality/);
});

test('pgvector migration uses extensions.vector(768) and HNSW cosine index',()=>{
  const sql=read('supabase/migration_templates/world_community_v4.sql');
  assert.match(sql,/extensions\.vector\(768\)/); assert.match(sql,/using hnsw \(embedding vector_cosine_ops\)/i);
});

test('migration does not create or alter objects inside locked realtime schema',()=>{
  const sql=read('supabase/migration_templates/world_community_v4.sql').toLowerCase();
  assert.doesNotMatch(sql,/create\s+(table|function|trigger|view|schema)\s+.*realtime\./);
  assert.doesNotMatch(sql,/alter\s+(table|schema|function)\s+realtime\./);
  assert.match(sql,/realtime\.send\(/);
});

test('database broadcast trigger is isolated in non-exposed schema and not executable by clients',()=>{
  const sql=read('supabase/migration_templates/world_community_v4.sql');
  assert.match(sql,/create schema if not exists world_private/i);
  assert.match(sql,/world_private\.world_chat_broadcast_v4/);
  assert.match(sql,/revoke all on function world_private\.world_chat_broadcast_v4\(\) from public, anon, authenticated/i);
  assert.match(sql,/true\s*\n\s*\);/); // private broadcast flag
});

test('feature votes are unique per user/candidate and limited to +/-1',()=>{
  const sql=read('supabase/migration_templates/world_community_v4.sql');
  assert.match(sql,/primary key\(user_id,candidate_key\)/i);
  assert.match(sql,/check \(vote in \(-1,1\)\)/i);
});

test('chat persistence is idempotent by client message id',()=>{
  const sql=read('supabase/migration_templates/world_community_v4.sql');
  assert.match(sql,/unique\(user_id,client_message_id\)/i);
  assert.match(read('api/community-message.js'),/client_message_id/);
});

test('community report normalization requires a target and bounds content',()=>{
  assert.throws(()=>moderation.normalizeReport({reason:'spam'}));
  const r=moderation.normalizeReport({messageId:'m1',reason:'spam',details:' x '.repeat(800)});
  assert.equal(r.message_id,'m1'); assert.equal(r.reason,'spam'); assert.ok(r.details.length<=1000);
});

test('spam window rejects bursts and repeated messages',()=>{
  const w=new moderation.SpamWindow({limit:3,duplicateLimit:2,windowMs:999999});
  assert.equal(w.check('u','same').allowed,true);
  assert.equal(w.check('u','same').allowed,true);
  assert.equal(w.check('u','same').allowed,false);
});

test('player state defense rejects stale sequence, teleport and impossible speed',()=>{
  const now=Date.now(),last={userId:'u',seq:4,at:now-1000,state:{x:0,y:0,z:0}};
  assert.equal(authority.validateStateEnvelope({userId:'u',seq:4,at:now,state:{x:1,y:0,z:0}},{last}).reason,'stale-sequence');
  assert.equal(authority.validateStateEnvelope({userId:'u',seq:5,at:now,state:{x:100,y:0,z:0}},{last}).reason,'teleport-threshold');
  assert.equal(authority.validateStateEnvelope({userId:'u',seq:5,at:now,state:{x:34,y:0,z:0}},{last,maxSpeed:20,maxTeleport:100}).reason,'speed-threshold');
});

test('binary player state codec round-trips UUID, sequence, full timestamp and motion',()=>{
  const c=loadIife('shared/multiplayer/world-state-codec.js');
  const at=Date.now(),id='123e4567-e89b-12d3-a456-426614174000';
  const msg={userId:id,seq:123,at,state:{x:1.25,y:-2.5,z:3.75,yaw:0.5,pitch:-0.25,flags:7,vx:1.23,vz:-4.56}};
  const bytes=c.WorldStateCodec.encode(msg); assert.ok(bytes); assert.equal(bytes.byteLength,55);
  const out=c.WorldStateCodec.decode(bytes); assert.equal(out.userId,id); assert.equal(out.seq,123); assert.equal(out.at,at);
  assert.ok(Math.abs(out.state.x-1.25)<1e-6); assert.equal(out.state.flags,7); assert.equal(out.state.vx,1.23); assert.equal(out.state.vz,-4.56);
});

test('multiplayer bridge uses private replay, binary state, adaptive ticks and reconnect',()=>{
  const s=read('shared/multiplayer/world-multiplayer-bridge.js');
  assert.match(s,/private:true/); assert.match(s,/replay:\{since:replaySince,limit:25\}/);
  assert.match(s,/player_state_bin/); assert.match(s,/adaptiveTickHz/); assert.match(s,/scheduleReconnect/);
  assert.match(s,/global\.document\?\.hidden/);
});

test('durable chat and feedback both have offline outboxes',()=>{
  const bridge=read('shared/multiplayer/world-multiplayer-bridge.js');
  const widget=read('shared/feedback/world-feedback-widget.js');
  assert.match(bridge,/WorldOfflineOutbox/); assert.match(bridge,/\/api\/community-message/);
  assert.match(widget,/WorldFeedbackOutbox/); assert.match(widget,/enqueue/);
});

test('WebRTC voice is mesh-limited and explicitly signals SFU requirement',()=>{
  const s=read('shared/multiplayer/world-webrtc-voice.js');
  assert.match(s,/maxPeers=4/); assert.match(s,/requiresSfu:true/); assert.match(s,/RTCPeerConnection/); assert.match(s,/voice-signal/);
});

test('RTC config supports short-lived TURN credentials and mesh cap',()=>{
  const s=read('api/rtc-config.js');
  assert.match(s,/WORLD_TURN_SECRET/); assert.match(s,/createHmac/); assert.match(s,/WORLD_VOICE_MESH_MAX_PEERS/);
  assert.match(s,/requireUser/);
});

test('Live Translate token is ephemeral, constrained, single-use and API key never returned',()=>{
  const s=read('lib/world-live-translate-token.js');
  assert.equal(live.MODEL,'gemini-3.5-live-translate-preview');
  assert.equal(live.targetLanguage('pt-BR'),'pt-BR'); assert.equal(live.targetLanguage('bad code!'),'en');
  assert.match(s,/uses:1/); assert.match(s,/liveConnectConstraints/); assert.match(s,/translationConfig/); assert.match(s,/auth_tokens/);
  const api=read('api/live-translate-token.js'); assert.doesNotMatch(api,/apiKey\s*:/); assert.match(api,/requireUser/);
});

test('Live Translate client uses 16k PCM input, 24k playback and transcripts',()=>{
  const s=read('shared/multiplayer/world-live-translate.js');
  assert.match(s,/rate=16000/); assert.match(s,/play\(unb64\(inline\.data\),24000\)/);
  assert.match(s,/input-transcript/); assert.match(s,/output-transcript/);
});

test('community UI supports guest auth, report, mute, voting and voice translation',()=>{
  const chat=read('apps/community-chat/index.html');
  const feedback=read('apps/feedback/index.html');
  assert.match(chat,/signInAnonymously/); assert.match(chat,/WorldCommunitySafety/); assert.match(chat,/safety\.report/); assert.match(chat,/mute/); assert.match(chat,/WorldWebRTCVoice/); assert.match(chat,/WorldLiveTranslate/); assert.match(chat,/translation-correction/);
  assert.match(feedback,/signInAnonymously/); assert.match(feedback,/feature-vote/); assert.match(feedback,/feedback-roadmap/);
});

test('glossary protects project terms and all 11 commercial locales remain configured',()=>{
  const g=JSON.parse(read('shared/i18n/world-glossary.json'));
  for(const term of ['Improve World','Navigator','World_server','Supabase','Vercel','Godot','World Spec']) assert.ok(g.protectedTerms.includes(term));
  const l=JSON.parse(read('shared/i18n/world-locales.json'));
  const codes=(Array.isArray(l)?l:l.locales).map(x=>typeof x==='string'?x:x.code);
  for(const code of ['en','zh-CN','ja','ko','de','fr','es','pt-BR','it','ar','ru']) assert.ok(codes.includes(code),code);
});

test('feedback public roadmap never needs raw private feedback text',()=>{
  const triage=read('scripts/world-user-feedback-loop.cjs');
  const roadmap=read('api/feedback-roadmap.js');
  assert.match(triage,/public_consent/); assert.match(triage,/public_title/);
  assert.match(roadmap,/public_title/); assert.doesNotMatch(roadmap,/select\([^)]*raw_text/i);
});

test('feedback evidence chain reuses existing root-cause, replay, regression and release systems',()=>{
  const s=read('scripts/world-feedback-evidence-chain.cjs');
  for(const x of ['quality:root-cause','quality:generate-tests','quality:tournament','integration:record-replay','release:gate']) assert.match(s,new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(s,/automaticMutation:false/);
});

test('multiplayer contract explicitly distinguishes validation from authority and requires dedicated server at scale',()=>{
  const c=JSON.parse(read('google-ai-studio/multiplayer-contract-v4.json'));
  const raw=JSON.stringify(c).toLowerCase();
  assert.match(raw,/never label client-side validation as anti-cheat authority/); assert.match(raw,/dedicated/); assert.match(raw,/sfu/);
});


test('per-world translation glossary and user corrections are review-gated',()=>{
  const sql=read('supabase/migration_templates/world_community_v4.sql');
  const tr=read('lib/world-translation.js');
  const api=read('api/translation-correction.js');
  assert.match(sql,/world_translation_terms/); assert.match(sql,/world_translation_corrections/);
  assert.match(sql,/status text not null default 'pending'/); assert.match(tr,/loadDynamicGlossary/); assert.match(tr,/exactCorrection/);
  assert.match(api,/status:'pending'/); assert.match(api,/requireUser/);
});

test('chat translation is authenticated and scoped to world glossary',()=>{
  const bridge=read('shared/multiplayer/world-multiplayer-bridge.js'); const api=read('api/translate.js');
  assert.match(bridge,/authorization:`Bearer \$\{token\}`/); assert.match(bridge,/worldId:this\.worldId/);
  assert.match(api,/requireUser/); assert.match(api,/loadDynamicGlossary/); assert.match(api,/glossaryRevision/);
});

test('feedback-to-experiment bridge reuses existing flags and experiment engines without auto enable',()=>{
  const s=read('scripts/world-feedback-experiment-bridge.cjs');
  assert.match(s,/integration:flags/); assert.match(s,/quality:experiment/); assert.match(s,/automaticEnable:false/); assert.match(s,/sandbox/i);
});

test('shared auth helper centralizes bearer session validation for community APIs',()=>{
  const a=read('lib/world-api-auth.js'); assert.match(a,/admin\.auth\.getUser/); assert.match(a,/Authentication required/);
  for(const f of ['api/community-message.js','api/community-report.js','api/feature-vote.js','api/rtc-config.js','api/live-translate-token.js','api/translation-correction.js']) assert.match(read(f),/world-api-auth/);
});

test('V4 readiness never converts static PASS into live PASS',()=>{
  const s=read('scripts/world-v4-readiness.cjs');
  assert.match(s,/WORLD_COMMUNITY_V4_SCHEMA_READY/); assert.match(s,/WORLD_MULTIPLAYER_V4_LIVE_VERIFIED/);
  assert.match(s,/WORLD_FEEDBACK_LIVE_VERIFIED/); assert.match(s,/WORLD_TRANSLATION_LIVE_VERIFIED/); assert.match(s,/WORLD_VOICE_LIVE_VERIFIED/);
  assert.match(s,/staticPercent\*0\.55\+v4LivePercent\*0\.45/);
  assert.doesNotMatch(s,/staticPercent\+Number\(p\.percent\)/);
});

test('installed V4 wires new APIs and gates while retaining a telemetry learner alias',()=>{
  const pkg=JSON.parse(read('package.json'));
  for(const script of ['world:v4:gate','world:readiness:v4','world:feedback:semantic','world:feedback:experiments','world:multiplayer:scale-gate']) assert.ok(pkg.scripts?.[script],script);
  assert.ok(pkg.scripts?.['quality:world:feedback:telemetry']);
  const server=read('server.js');
  for(const route of ['feature-vote','feedback-roadmap','community-report','community-message','live-translate-token','rtc-config','translation-correction']) assert.match(server,new RegExp(route));
});
