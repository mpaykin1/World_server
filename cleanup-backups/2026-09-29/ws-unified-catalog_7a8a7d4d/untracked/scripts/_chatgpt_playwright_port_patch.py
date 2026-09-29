from pathlib import Path
p=Path(r'C:\Users\user\Desktop\.tools\ws-unified-catalog\playwright.config.js')
s=p.read_text(encoding='utf-8-sig')
s=s.replace("const { defineConfig, devices } = require('@playwright/test');\n", "const { defineConfig, devices } = require('@playwright/test');\n\nconst e2ePort = Number(process.env.WORLD_E2E_PORT || 3137);\nconst e2eBaseURL = process.env.WORLD_E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;\n")
s=s.replace("    baseURL: 'http://localhost:3000',", "    baseURL: e2eBaseURL,")
s=s.replace("    command: 'node server.js',\n    url: 'http://localhost:3000/apps/ai3d-voxel-city/',\n    reuseExistingServer: !process.env.CI,", "    command: 'node server.js',\n    url: `${e2eBaseURL}/apps/ai3d-voxel-city/`,\n    env: { ...process.env, PORT: String(e2ePort) },\n    reuseExistingServer: process.env.WORLD_E2E_REUSE_EXISTING === '1',")
p.write_text(s,encoding='utf-8')
print('patched playwright.config.js')