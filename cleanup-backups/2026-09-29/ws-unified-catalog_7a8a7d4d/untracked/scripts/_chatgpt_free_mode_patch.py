from pathlib import Path
root=Path(r'C:\Users\user\Desktop\.tools\ws-unified-catalog')
def patch(rel,old,new):
 p=root/rel;s=p.read_text(encoding='utf-8-sig')
 if old not in s: raise SystemExit(f'missing block: {rel}')
 p.write_text(s.replace(old,new,1),encoding='utf-8');print('patched',rel)

p=root/'lib/env.js';s=p.read_text(encoding='utf-8-sig')
old="""function getPublicConfig() {\n  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);\n  const publishableKey = firstEnv([\n    'SUPABASE_PUBLISHABLE_KEY',\n    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',\n    'SUPABASE_ANON_KEY',\n    'NEXT_PUBLIC_SUPABASE_ANON_KEY'\n  ]);\n  if (!url || !publishableKey) {\n    throw new Error('Supabase public environment variables are not configured.');\n  }\n  return { url, publishableKey };\n}\n"""
new="""function getOptionalPublicConfig() {\n  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);\n  const publishableKey = firstEnv([\n    'SUPABASE_PUBLISHABLE_KEY',\n    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',\n    'SUPABASE_ANON_KEY',\n    'NEXT_PUBLIC_SUPABASE_ANON_KEY'\n  ]);\n  return { url, publishableKey, configured: Boolean(url && publishableKey) };\n}\nfunction getPublicConfig() {\n  const { url, publishableKey, configured } = getOptionalPublicConfig();\n  if (!configured) throw new Error('Supabase public environment variables are not configured.');\n  return { url, publishableKey };\n}\n"""
if old not in s: raise SystemExit('env block missing')
s=s.replace(old,new,1)
s=s.replace("module.exports = { firstEnv, getPublicConfig, getSecretKey, createAdminClient, createPublicServerClient };","module.exports = { firstEnv, getOptionalPublicConfig, getPublicConfig, getSecretKey, createAdminClient, createPublicServerClient };")
p.write_text(s,encoding='utf-8');print('patched lib/env.js')
patch('api/config.js',
"const { getPublicConfig } = require('../lib/env');",
"const { getOptionalPublicConfig } = require('../lib/env');")
patch('api/config.js',
"  const { url, publishableKey } = getPublicConfig();\n  sendJson(res, 200, { supabaseUrl: url, supabasePublishableKey: publishableKey });",
"  const { url, publishableKey, configured } = getOptionalPublicConfig();\n  sendJson(res, 200, { supabaseEnabled: configured, supabaseUrl: url, supabasePublishableKey: publishableKey });")
old="""  async function createSupabase() {\n    const [library, response] = await Promise.all([loadSupabaseBrowser(), fetch('/api/config', { headers: { Accept: 'application/json' } })]);\n    const config = await response.json().catch(() => ({}));\n    if (!response.ok || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error(config.error || 'Supabase не настроен.');\n    const client = library.createClient(config.supabaseUrl, config.supabasePublishableKey, {\n"""
new="""  async function createSupabase() {\n    const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });\n    const config = await response.json().catch(() => ({}));\n    if (!response.ok || config.supabaseEnabled === false || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error(config.error || 'Supabase не настроен.');\n    const library = await loadSupabaseBrowser();\n    const client = library.createClient(config.supabaseUrl, config.supabasePublishableKey, {\n"""
patch('shared/common.js',old,new)
print('FREE MODE PATCH COMPLETE')