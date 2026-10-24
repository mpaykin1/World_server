#!/usr/bin/env node
// GRAF GitHub Bridge — standalone Node.js 22+ service (zero npm dependencies).
// Run: node bridge.mjs  |  npm test
import http from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, createHash, createSign, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const now = () => Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const sha = x => createHash('sha256').update(x).digest('hex');
const text = x => typeof x === 'string' ? x : '';
const safeInt = (x, fallback, min = 1, max = 100000) => Number.isInteger(+x) && +x >= min && +x <= max ? +x : fallback;
const repoOK = r => typeof r === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r);
const expectString = (s, name, max = 65536) => {
  if (typeof s !== 'string' || !s.trim() || s.length > max) throw new HttpError(400, `Invalid ${name}`);
  return s;
};
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export class GithubError extends Error { constructor(status, message, retryAfter = 0) {
  super(`GitHub HTTP ${status}: ${String(message).slice(0, 250)}`); this.status = status; this.retryAfter = retryAfter;
  this.transient = status === 429 || status >= 500 || (status === 403 && retryAfter > 0);
} }
export function validateJob(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Invalid JSON object');
  const { repo, action, payload: p } = input;
  if (!repoOK(repo) || !allowed.includes(repo)) throw new HttpError(403, 'Repository not allowed');
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpError(400, 'Invalid payload');
  const number = k => { const n = p[k]; if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(400, `Invalid ${k}`); return n; };
  const body = k => expectString(p[k], k, 60000);
  const optBody = k => p[k] == null ? '' : (typeof p[k] === 'string' && p[k].length <= 60000 ? p[k] : (() => {throw new HttpError(400, `Invalid ${k}`)})());
  let data;
  switch (action) {
    case 'create_issue': data = { title: expectString(p.title, 'title', 256), body: optBody('body') }; break;
    case 'update_issue': data = { issue_number: number('issue_number'), ...pickEdits(p, ['title', 'body'], ['open','closed']) }; break;
    case 'comment_issue': data = { issue_number: number('issue_number'), body: body('body') }; break;
    case 'update_comment': data = { comment_id: number('comment_id'), body: body('body') }; break;
    case 'create_pr':
      data = { title: expectString(p.title, 'title', 256), head: expectString(p.head, 'head', 240), base: expectString(p.base, 'base', 240), body: optBody('body'), draft: p.draft === true };
      if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(data.head) || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(data.base) || data.base === data.head) throw new HttpError(400, 'Invalid PR branches');
      break;
    case 'update_pr': data = { pr_number: number('pr_number'), ...pickEdits(p, ['title','body','base'], ['open','closed']) }; break;
    default: throw new HttpError(400, 'Unsupported action');
  }
  return { repo, action, payload: data };
}
function pickEdits(p, fields, states) {
  const d = {};
  for (const k of fields) if (p[k] != null) d[k] = expectString(p[k], k, k === 'body' ? 60000 : 256);
  if (p.state != null) { if (!states.includes(p.state)) throw new HttpError(400,'Invalid state'); d.state = p.state; }
  if (!Object.keys(d).length) throw new HttpError(400, 'No changes');
  return d;
}
export function loadConfig(env = process.env) {
  const appId = expectString(env.GITHUB_APP_ID, 'GITHUB_APP_ID', 32);
  if (!/^\d+$/.test(appId)) throw new Error('GITHUB_APP_ID must be numeric');
  const installationId = expectString(env.GITHUB_INSTALLATION_ID, 'GITHUB_INSTALLATION_ID', 32);
  if (!/^\d+$/.test(installationId)) throw new Error('GITHUB_INSTALLATION_ID must be numeric');
  const token = expectString(env.BRIDGE_API_TOKEN, 'BRIDGE_API_TOKEN', 2048);
  if (Buffer.byteLength(token) < 32) throw new Error('BRIDGE_API_TOKEN must be >=32 bytes');
  const pem = env.GITHUB_APP_PRIVATE_KEY_PEM || readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH || '/run/secrets/github-app.pem', 'utf8');
  if (!pem.includes('PRIVATE KEY')) throw new Error('GitHub App private key missing');
  const repos = (env.ALLOWED_REPOS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!repos.length || repos.some(r => !repoOK(r))) throw new Error('ALLOWED_REPOS must contain owner/repository');
  const apiBase = env.GITHUB_API_BASE || 'https://api.github.com';
  if (new URL(apiBase).protocol !== 'https:' && !(env.BRIDGE_TEST_MODE === '1' && new URL(apiBase).hostname === '127.0.0.1')) throw new Error('GitHub API requires HTTPS');
  return {
    appId, installationId, token, pem, repos, apiBase: apiBase.replace(/\/$/, ''),
    dataFile: resolve(env.BRIDGE_DATA_FILE || './data/queue.json'),
    host: env.HOST || '127.0.0.1', port: safeInt(env.PORT, 8765, 1, 65535),
    maxAttempts: safeInt(env.MAX_ATTEMPTS, 12, 1, 100), interval: safeInt(env.POLL_MS, 1000, 100, 60000)
  };
}

export class Store {
  constructor(file) {
    this.file = resolve(file);
    mkdirSync(dirname(this.file), {recursive:true, mode:0o700});
    if (existsSync(this.file)) {
      this.jobs = JSON.parse(readFileSync(this.file, 'utf8')).jobs;
      if (!Array.isArray(this.jobs)) throw new Error('Invalid queue file; refusing data loss');
      let recovered = false;
      for (const j of this.jobs) if (j.status === 'running') { j.status = 'queued'; j.nextAt = now(); recovered = true; }
      if (recovered) this.save();
    } else { this.jobs = []; this.save(); }
  }
  save() {
    // Atomic replace + fsync file. Single process/writer; data dir MUST be persisted.
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({version:1, jobs:this.jobs}, null, 2), {mode:0o600});
    const fd = openSync(tmp,'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, this.file);
    // Some Windows filesystems disallow opening directories as file descriptors.
    if (process.platform !== 'win32') { const dirfd = openSync(dirname(this.file),'r'); try { fsyncSync(dirfd); } finally { closeSync(dirfd); } }
  }
  submit(data, idem) {
    if (typeof idem !== 'string' || !/^[A-Za-z0-9_.:-]{8,160}$/.test(idem)) throw new HttpError(400,'Idempotency-Key required (8-160 safe characters)');
    const digest = sha(JSON.stringify(data));
    const prev = this.jobs.find(j => j.idem === idem);
    if (prev) { if (prev.digest !== digest) throw new HttpError(409,'Idempotency key used for different request'); return {job:prev,existing:true}; }
    if (this.jobs.length >= 10000) throw new HttpError(503, 'Queue full');
    const t = now();
    const job = {id:randomUUID(),idem,digest,...data,status:'queued',attempts:0,createdAt:t,updatedAt:t,nextAt:t,result:null,error:null};
    this.jobs.push(job); this.save();
    return {job,existing:false};
  }
  due() { return this.jobs.find(j => j.status === 'queued' && j.nextAt <= now()); }
  update(job, changes) { Object.assign(job,changes,{updatedAt:now()}); this.save(); }
  public(job) {
    return {id:job.id, action:job.action, repo:job.repo, status:job.status, attempts:job.attempts,
      createdAt:job.createdAt, updatedAt:job.updatedAt, nextAt:job.status==='queued'?job.nextAt:null,
      result:job.result, error:job.error};
  }
}

export class GithubClient {
  constructor(config, fetchFn = fetch) { this.c = config; this.fetch = fetchFn; this.token = null; this.tokenExpiry = 0; }
  jwt() {
    const t = Math.floor(now()/1000);
    const msg = `${enc({alg:'RS256',typ:'JWT'})}.${enc({iat:t-60,exp:t+540,iss:this.c.appId})}`;
    const sign = createSign('RSA-SHA256'); sign.update(msg); sign.end();
    return `${msg}.${sign.sign(this.c.pem).toString('base64url')}`;
  }
  async installationToken() {
    if (this.token && this.tokenExpiry - 300000 > now()) return this.token;
    const u = `${this.c.apiBase}/app/installations/${this.c.installationId}/access_tokens`;
    const r = await this.raw(u, {method:'POST', headers:{authorization:`Bearer ${this.jwt()}`},body:'{}'});
    this.token = r.token; this.tokenExpiry = Date.parse(r.expires_at) || now()+3000000;
    if (!this.token) throw new Error('Missing GitHub installation token');
    return this.token;
  }
  async raw(url, options={}) {
    let r;
    try { r = await this.fetch(url, { ...options, signal:AbortSignal.timeout(20000), headers:{
      accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',
      'user-agent':'graf-github-bridge/1.0','content-type':'application/json', ...options.headers
    }}); } catch(e) { const err = new Error(`GitHub transport: ${e.message}`); err.transient=true; throw err; }
    const raw = await r.text();
    let data; try {data = raw ? JSON.parse(raw) : {};} catch {data={message:raw.slice(0,250)}}
    if (!r.ok) {
      const retrySecs = Number(r.headers.get('retry-after'));
      const reset = Number(r.headers.get('x-ratelimit-reset'));
      const resetWait = reset && r.headers.get('x-ratelimit-remaining') === '0' ? Math.max(0, reset*1000-now()) : 0;
      throw new GithubError(r.status,data.message||'API error', Math.max(Number.isFinite(retrySecs)?retrySecs*1000:0, resetWait));
    }
    return data;
  }
  async api(repo, method, path, body) {
    if (!this.c.repos.includes(repo)) throw new HttpError(403,'Repository not allowed');
    const tok = await this.installationToken();
    // Path is constructed solely from validated constants/positive integers.
    return this.raw(`${this.c.apiBase}/repos/${repo}${path}`,{method,headers:{authorization:`Bearer ${tok}`}, ...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  async diagnostic(repo) {
    const a = await this.api(repo,'GET','');
    const b = await this.api(repo,'GET','/issues?state=open&per_page=1');
    const c = await this.api(repo,'GET','/pulls?state=open&per_page=1');
    return {repo, repository:a.full_name, defaultBranch:a.default_branch, issuesReadable:Array.isArray(b), pullsReadable:Array.isArray(c)};
  }
  // Guard create/comment retries against duplicate remote effects after network loss.
  async findMarker(repo, route, id) {
    for (let page=1;page<=5;page++) {
      const suffix = route.includes('?')?'&':'?';
      const entries = await this.api(repo,'GET',`${route}${suffix}per_page=100&page=${page}`);
      if (!Array.isArray(entries)) throw new Error('GitHub returned invalid scan');
      const hit=entries.find(item=>typeof item.body==='string' && item.body.includes(`<!-- graf-bridge:${id} -->`));
      if (hit) return {number:hit.number, id:hit.id, url:hit.html_url, deduplicated:true};
      if (entries.length < 100) return null;
    }
    // Better block than silently create duplicate when old marker may be outside scan window.
    throw new Error('Marker scan exceeded 500 items; manual reconciliation required');
  }
  async execute(job) {
    const {repo,action,payload:p,id}=job;
    const marker = `<!-- graf-bridge:${id} -->`;
    if (action === 'create_issue') {
      const found = await this.findMarker(repo,'/issues?state=all&sort=created&direction=desc',id);
      if (found) return found;
      const o=await this.api(repo,'POST','/issues',{title:p.title, body:`${p.body}\n\n${marker}`});
      return {number:o.number,url:o.html_url};
    }
    if (action === 'create_pr') {
      const found=await this.findMarker(repo,'/pulls?state=all&sort=created&direction=desc',id);
      if (found) return found;
      const o=await this.api(repo,'POST','/pulls',{...p,body:`${p.body}\n\n${marker}`});
      return {number:o.number,url:o.html_url};
    }
    if (action === 'comment_issue') {
      const found=await this.findMarker(repo,`/issues/${p.issue_number}/comments`,id);
      if(found) return found;
      const o=await this.api(repo,'POST',`/issues/${p.issue_number}/comments`,{body:`${p.body}\n\n${marker}`});
      return {id:o.id,url:o.html_url};
    }
    if (action === 'update_comment') {
      const o=await this.api(repo,'PATCH',`/issues/comments/${p.comment_id}`,{body:p.body});
      return {id:o.id,url:o.html_url};
    }
    if (action === 'update_issue') {
      const {issue_number,...rest}=p; const o=await this.api(repo,'PATCH',`/issues/${issue_number}`,rest); return {number:o.number,url:o.html_url};
    }
    if (action === 'update_pr') {
      const {pr_number,...rest}=p; const o=await this.api(repo,'PATCH',`/pulls/${pr_number}`,rest); return {number:o.number,url:o.html_url};
    }
    throw new Error('Unexpected operation');
  }
}
export class Worker {
  constructor(store, github, maxAttempts=12) { this.s=store; this.g=github; this.max=maxAttempts; this.busy=false; }
  async tick() {
    if(this.busy) return;
    const job=this.s.due(); if(!job) return;
    this.busy=true;
    this.s.update(job,{status:'running',attempts:job.attempts+1});
    try {
      const result=await this.g.execute(job);
      this.s.update(job,{status:'done',result,error:null,nextAt:null});
    } catch (e) {
      const transient=e.transient===true;
      // Explicit hard failures and ambiguous scan excess require intervention, not duplicates.
      const retry = transient && job.attempts<this.max;
      const jitter=Math.floor(Math.random()*1500);
      const delay=Math.min(3600000,Math.max(e.retryAfter||0,Math.min(600000,1500*Math.pow(2,Math.min(job.attempts,9)))+jitter));
      this.s.update(job,{status:retry?'queued':'blocked', nextAt:retry?now()+delay:null,
        error:{message:String(e.message).slice(0,300),status:e.status||null,transient}});
    } finally {this.busy=false;}
  }
}
function bearerValid(req, token) {
  const a=Buffer.from((req.headers.authorization||'').replace(/^Bearer /i,''));
  const b=Buffer.from(token);
  return a.length===b.length && timingSafeEqual(a,b);
}
async function bodyJSON(req, limit=128*1024) {
  let total=0; const chunks=[];
  for await(const chunk of req) {total+=chunk.length;if(total>limit)throw new HttpError(413,'Body too large'); chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw new HttpError(400,'Malformed JSON');}
}
function respond(res, status, value) {
  const s=JSON.stringify(value); res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-length':Buffer.byteLength(s)});res.end(s);
}
export function serve(config, store = new Store(config.dataFile), github = new GithubClient(config)) {
  const worker=new Worker(store,github,config.maxAttempts);
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    try {
      if(req.method==='GET' && url.pathname==='/health/live') return respond(res,200,{ok:true,service:'graf-github-bridge'});
      if(!bearerValid(req,config.token)) return respond(res,401,{error:'Unauthorized'});
      if(req.method==='GET' && url.pathname==='/health/ready') return respond(res,200,{ok:true,queue:store.jobs.length,processing:worker.busy});
      if(req.method==='GET' && url.pathname==='/v1/jobs') return respond(res,200,{jobs:store.jobs.slice(-Math.min(safeInt(url.searchParams.get('limit'),20,1,100),100)).reverse().map(j=>store.public(j))});
      const hit=url.pathname.match(/^\/v1\/jobs\/([a-f0-9-]{36})$/);
      if(req.method==='GET'&&hit) {const job=store.jobs.find(x=>x.id===hit[1]); return job?respond(res,200,store.public(job)):respond(res,404,{error:'Not found'});}
      if(req.method==='POST' && url.pathname==='/v1/jobs') {
        const value=validateJob(await bodyJSON(req),config.repos);
        const {job,existing}=store.submit(value,req.headers['idempotency-key']);
        // Wake once, but do not block the request on GitHub or disclose secrets.
        void worker.tick();
        return respond(res,existing?200:202,{existing,...store.public(job)});
      }
      if(req.method==='POST' && url.pathname==='/v1/diagnostics') {
        const input=await bodyJSON(req);
        if(!config.repos.includes(input.repo)) throw new HttpError(403,'Repository not allowed');
        return respond(res,200,await github.diagnostic(input.repo));
      }
      return respond(res,404,{error:'Not found'});
    } catch(e) {
      const code = e instanceof HttpError ? e.status : e instanceof GithubError && !e.transient ? 502 : 503;
      respond(res,code,{error:e.message.slice(0,300)});
    }
  });
  const timer=setInterval(()=>{void worker.tick();}, config.interval);timer.unref();
  server.on('close',()=>clearInterval(timer));
  server.listen(config.port,config.host);
  return {server,worker};
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {const c=loadConfig(); serve(c); console.log(`GRAF Bridge listening on ${c.host}:${c.port}`);}
  catch(e){console.error('Configuration error:',e.message);process.exitCode=1;}
}
