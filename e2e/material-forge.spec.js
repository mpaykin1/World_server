const { test, expect } = require('@playwright/test');
const path = require('node:path');

test.describe('Material Forge adaptive runtime', () => {
  for (const app of ['voxel-world', 'survival']) {
    test(`${app} reuses Material Forge without mandatory authored downloads`, async ({ page }, testInfo) => {
      const hardErrors = [];
      page.on('console', message => {
        const text = message.text();
        if (message.type() === 'error' && (/WebGLProgram: Shader Error/i.test(text) || /MATERIAL_FORGE.*(?:invalid|failed|error)/i.test(text))) hardErrors.push(text);
      });
      page.on('pageerror', error => {
        if (/material.?forge/i.test(error.message)) hardErrors.push(error.message);
      });
      const response = await page.goto(`/apps/${app}/`, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
      await page.waitForFunction(() => Boolean(window.WorldMaterialForge?.stats), null, { timeout: 20000 });
      const evidence = await page.evaluate(() => {
        const probe={isMeshStandardMaterial:true,transparent:false,opacity:1,roughness:.95,metalness:0,emissiveIntensity:1,userData:{},needsUpdate:false};
        window.WorldMaterialForge.enhanceMaterial(probe,'stone',{geometry:{getAttribute(){return null;}},userData:{}},{id:'world-stone'});
        return {
          forge: window.WorldMaterialForge.stats(),
          probe: probe.userData.materialForge,
          microdetail: window.UniversalVoxelMicrodetail?.stats?.() || null,
          canvas: [...document.querySelectorAll('canvas')].map(item => ({ width: item.width, height: item.height, clientWidth: item.clientWidth, clientHeight: item.clientHeight })),
          authoredRequests: performance.getEntriesByType('resource').map(item => item.name).filter(name => name.includes('/shared/materials/'))
        };
      });
      expect(evidence.forge.schemaVersion).toBe('1.0.0');
      expect(evidence.forge.sourceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(['SAFE', 'BALANCED', 'HIGH', 'ULTRA']).toContain(evidence.forge.activeTier);
      expect(evidence.forge.proceduralFallbacks).toBeGreaterThan(0);
      expect(evidence.probe.authoredMaps).toBe(false);
      expect(evidence.authoredRequests).toEqual([]);
      expect(evidence.canvas.some(canvas => canvas.width > 0 && canvas.height > 0 && canvas.clientWidth > 0 && canvas.clientHeight > 0)).toBe(true);
      expect(hardErrors, `${testInfo.project.name} ${app}`).toEqual([]);
    });
  }

  test('authored triplanar PBR maps compile in the real WebGL renderer', async ({ page }, testInfo) => {
    const hardErrors = [];
    page.on('console', message => {
      if (message.type() === 'error' && /WebGLProgram: Shader Error|MATERIAL_FORGE/i.test(message.text())) hardErrors.push(message.text());
    });
    await page.route('**/shared/materials/e2e-stone/*.png', route => route.fulfill({
      path: path.join(__dirname, '..', 'test', 'fixtures', 'cube_object.png'),
      contentType: 'image/png'
    }));
    await page.goto('/apps/voxel-world/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WorldMaterialForge?.registry?.policy?.tiers, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const THREE = await import('https://unpkg.com/three@0.165.0/build/three.module.js');
      const { createMaterialForgeRuntime } = await import('/shared/graphics/material-forge-runtime.js');
      const baseRegistry = window.WorldMaterialForge.registry;
      const hashSeed = { basecolor: 'a', normal: 'b', orm: 'c' };
      const variant = (channel) => ({
        uri: `/shared/materials/e2e-stone/e2e-stone_${channel}_HIGH.png`,
        width: 256,
        height: 256,
        bytes: 810,
        sha256: hashSeed[channel].repeat(64),
        tier: 'HIGH'
      });
      const recipe = {
        schemaVersion: '1.0.0', id: 'e2e-stone', displayName: 'E2E Stone',
        source: { tool: 'ArmorPaint', author: 'Fleet fixture', license: 'test-only', projectFile: 'e2e-stone.arm' },
        materialClass: 'stone', mapping: 'triplanar', match: { semantics: ['stone'], worlds: ['voxel-world'] },
        parameters: { roughness: .82, metalness: .04, normalStrength: .55, aoStrength: .72, emissiveIntensity: 0, tilingScale: 2, blend: 1 },
        maps: { baseColor: [variant('basecolor')], normal: [variant('normal')], orm: [variant('orm')] }, priority: 100
      };
      const registry = { ...baseRegistry, materials: { 'e2e-stone': recipe } };
      const runtime = createMaterialForgeRuntime({ THREE, registry, initialTier: 'HIGH', worldId: 'voxel-world' });
      const renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setSize(64, 64, false);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, .1, 20);
      camera.position.set(1.8, 1.4, 2.8);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 1.5));
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: 0 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      scene.add(mesh);
      runtime.enhanceMaterial(material, 'stone', mesh, { id: 'e2e-stone' });
      const deadline = performance.now() + 10000;
      while (runtime.stats().texturePlans < 1 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      renderer.render(scene, camera);
      const evidence = {
        authoredMaps: material.userData.materialForge?.authoredMaps,
        channels: material.userData.materialForge?.mapChannels,
        texturePlans: runtime.stats().texturePlans,
        programs: renderer.info.programs?.length || 0,
        glError: renderer.getContext().getError()
      };
      mesh.geometry.dispose(); material.dispose(); renderer.dispose();
      return evidence;
    });
    expect(result.authoredMaps).toBe(true);
    expect(result.channels.sort()).toEqual(['baseColor', 'normal', 'orm']);
    expect(result.texturePlans).toBe(1);
    expect(result.programs).toBeGreaterThan(0);
    expect(result.glError).toBe(0);
    expect(hardErrors, testInfo.project.name).toEqual([]);
  });

  test('compiled registry is served with strict web budgets', async ({ request }) => {
    const response = await request.get('/shared/material-forge-registry.json');
    expect(response.status()).toBe(200);
    const registry = await response.json();
    expect(registry.system).toBe('WORLD_MATERIAL_FORGE');
    expect(registry.policy.maxRuntimeDimension).toBe(4096);
    expect(registry.policy.guards.runtime16kForbidden).toBe(true);
    expect(Object.keys(registry.materials).length).toBeGreaterThanOrEqual(6);
  });
});
