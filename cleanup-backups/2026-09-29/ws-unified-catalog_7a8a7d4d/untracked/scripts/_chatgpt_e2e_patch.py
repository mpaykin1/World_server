from pathlib import Path
p=Path(r'C:\Users\user\Desktop\.tools\ws-unified-catalog\e2e\world-experience-standard.spec.js')
s=p.read_text(encoding='utf-8-sig')
old="""  await expect(page.locator('#goldenWorldButton')).toHaveCount(1);\n  await expect(page.locator('#goldenToolbar')).toHaveCount(0);\n  await page.locator('#goldenWorldButton').click();\n  await expect(page.locator('#goldenDrawer')).toHaveClass(/open/);\n"""
new="""  await expect(page.locator('#goldenWorldButton')).toHaveCount(1);\n  await expect(page.locator('#goldenWorldButton')).toBeHidden();\n  await expect(page.locator('#goldenToolbar')).toHaveCount(0);\n  await expect(page.locator('#goldenDrawer')).toHaveClass(/open/);\n"""
if old not in s: raise SystemExit('catalog test block not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('patched catalog e2e semantics')