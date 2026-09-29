from pathlib import Path
p=Path(__file__).resolve().parents[1]/'shared'/'golden-ui-shell.js'
t=p.read_text(encoding='utf-8')
old="    {match:'/apps/world-sharabass/',title:'World',selectors:['.app-title','.topHint']}"
extra="""    {match:'/apps/world-sharabass/',title:'World',selectors:['.app-title','.topHint']},
    {match:'/apps/dreamfog-world/',title:'DreamFog',selectors:['#dreamHud','#dreamHint']},
    {match:'/apps/ink-glyph-world/',title:'Ink Glyph',selectors:['.panel','.help']},
    {match:'/apps/pixel-panorama-360/',title:'Pixel Panorama',selectors:['#hud']},
    {match:'/apps/dark-void-scene/',title:'Dark Void',selectors:['#hud','.mobile-shell-hud']}"""
if extra not in t:
    if old not in t: raise SystemExit('anchor missing')
    p.write_text(t.replace(old,extra,1),encoding='utf-8')
    print('patched')
else: print('already patched')