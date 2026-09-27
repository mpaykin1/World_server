// Anonymous, long-lived browser sessions and verified Telegram WebApp pairing.
// Only hashes, never bearer tokens or bot secrets, are persisted in D1.
const enc=new TextEncoder();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bytes=n=>crypto.getRandomValues(new Uint8Array(n));
export const hashHex=async value=>[...new Uint8Array(await crypto.subtle.digest(
  'SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function newBrowserToken(){
  const b=bytes(32);
  return btoa(String.fromCharCode(...b)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
}
export function newLinkCode(){
  return [...bytes(12)].map(n=>alphabet[n%alphabet.length]).join('');
}
const digest=async(key,data)=>new Uint8Array(await crypto.subtle.sign(
  'HMAC',await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']),enc.encode(data)));
function hexEqual(a,b){
  if(!/^[a-f0-9]{64}$/i.test(a)||!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
export async function telegramUserId(initData,botToken,now=Date.now()){
  if(typeof initData!=='string'||initData.length>4096||!botToken)return null;
  const params=new URLSearchParams(initData),hash=params.get('hash');
  const ts=Number(params.get('auth_date')),user=params.get('user');
  if(!Number.isSafeInteger(ts)||Math.abs(now-ts*1000)>86400000||!hash||!user)return null;
  let parsed;
  try{parsed=JSON.parse(user);}catch{return null;}
  if(!Number.isSafeInteger(parsed.id)||parsed.id<=0)return null;
  const check=[...params.entries()].filter(([k])=>k!=='hash')
    .sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\\n');
  const secret=await digest(enc.encode('WebAppData'),botToken);
  const signed=[...await digest(secret,check)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return hexEqual(signed,hash)?String(parsed.id):null;
}
export async function createBrowserSession(db,initData,botToken){
  const verified=initData?await telegramUserId(initData,botToken):null;
  if(initData&&!verified)return null;
  const token=newBrowserToken(),tokenHash=await hashHex(token);
  const chatId=verified||'guest:'+tokenHash;
  if(!verified){
    // Inserting the world and bearer mapping is retry-safe on rare collisions.
    const {loadSession}=await import('./telegram-state.mjs');
    await loadSession(db,chatId);
  }else{
    const {loadSession}=await import('./telegram-state.mjs');
    await loadSession(db,chatId);
  }
  await db.prepare('INSERT INTO chain_browser_tokens(token_hash,chat_id) VALUES(?,?)')
    .bind(tokenHash,chatId).run();
  return{token,linked:!!verified};
}
export async function authorizeBrowser(db,request){
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')||'');
  if(!match)return null;
  const tokenHash=await hashHex(match[1]);
  const row=await db.prepare('SELECT chat_id FROM chain_browser_tokens WHERE token_hash=?')
    .bind(tokenHash).first();
  return row?{chatId:row.chat_id,tokenHash}:null;
}
export async function issueLinkCode(db,chatId){
  const code=newLinkCode();
  await db.prepare("DELETE FROM chain_link_codes WHERE expires_at < CURRENT_TIMESTAMP").run();
  await db.prepare("INSERT INTO chain_link_codes(code,chat_id,expires_at) VALUES(?,?,datetime('now','+10 minutes'))")
    .bind(code,String(chatId)).run();
  return code;
}
export async function redeemLinkCode(db,code,tokenHash){
  if(!/^[A-HJ-NP-Z2-9]{12}$/.test(code))return null;
  // DELETE RETURNING atomically consumes the code: a second browser cannot reuse it.
  const row=await db.prepare("DELETE FROM chain_link_codes WHERE code=? AND expires_at>CURRENT_TIMESTAMP RETURNING chat_id")
    .bind(code).first();
  if(!row)return null;
  const updated=await db.prepare('UPDATE chain_browser_tokens SET chat_id=?,last_used_at=CURRENT_TIMESTAMP WHERE token_hash=?')
    .bind(row.chat_id,tokenHash).run();
  return updated.meta?.changes===1?row.chat_id:null;
}
