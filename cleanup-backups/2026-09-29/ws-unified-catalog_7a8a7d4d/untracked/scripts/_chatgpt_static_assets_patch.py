from pathlib import Path
p=Path(r'C:\Users\user\Desktop\.tools\ws-unified-catalog\server.js')
s=p.read_text(encoding='utf-8-sig')
s=s.replace("  '.webmanifest': 'application/manifest+json; charset=utf-8'","  '.webmanifest': 'application/manifest+json; charset=utf-8',\n  '.webm': 'video/webm',\n  '.mp4': 'video/mp4',\n  '.woff2': 'font/woff2',\n  '.ttf': 'font/ttf'")
s=s.replace("  if (!url.pathname.startsWith('/apps/') && !url.pathname.startsWith('/shared/')) return notFound(res);","  if (!url.pathname.startsWith('/apps/') && !url.pathname.startsWith('/shared/') && !url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/data/')) return notFound(res);")
p.write_text(s,encoding='utf-8')
print('patched static assets + media MIME')