# Установка V10 в World_server

```powershell
cd <WORLD_FACTORY_QUALITY_CORE_V10>
python -m pip install -r requirements.txt
npm install --no-audit --no-fund
python .\tools\install_v10_patch.py --target C:\Users\user\Desktop\World_server
```

После установки Desktop AI должен выполнить полный порядок из `DESKTOP_AI_INSTRUCTIONS.md`: source SHA → V10 prepare → unit/static/pipeline → browser/fuzz/golden → Ratchet → canary → consumer drift → production smoke. Любой локально исправимый FAIL необходимо исправить до PASS. External hard blocker должен быть доказан логом.
