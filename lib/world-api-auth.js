'use strict';
function bearer(req){const m=/^Bearer\s+(.+)$/i.exec(String(req?.headers?.authorization||''));return m?.[1]||''}
async function requireUser(admin,req,httpError){const token=bearer(req);if(!token)throw httpError(401,'Authentication required.');const {data,error}=await admin.auth.getUser(token);if(error||!data?.user)throw httpError(401,'Invalid session.');return data.user}
async function optionalUser(admin,req){const token=bearer(req);if(!token)return null;const {data,error}=await admin.auth.getUser(token);return error?null:(data?.user||null)}
function csv(v){return new Set(String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))}
async function requireAdminUser(admin,req,httpError){const user=await requireUser(admin,req,httpError);const ids=csv(process.env.WORLD_ADMIN_USER_IDS),emails=csv(process.env.WORLD_ADMIN_EMAILS);if(!ids.has(String(user.id||'').toLowerCase())&&!emails.has(String(user.email||'').toLowerCase()))throw httpError(403,'Administrator permission required.');return user}
module.exports={bearer,requireUser,optionalUser,requireAdminUser};
