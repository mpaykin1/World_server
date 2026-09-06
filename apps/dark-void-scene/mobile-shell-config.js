'use strict';
/**
 * Project-local bindings for Dark Void Navigator.
 * Desktop AI may make selectors more exact, but must not fork control semantics.
 */
window.MobileGameShellConfig = Object.freeze({
  appId: 'dark-void-navigator',
  mobileOnly: true,
  preserveDesktop: true,
  portraitEyeScale: 0.70,
  landscapeEyeScale: 1.00,
  hideTouchControlHints: true,
  compactNavigator: true,
  moveSecondaryActionsToMenu: true,
  fullscreenButton: true,
  useGoldenControls: true,
  // Installer resolves "auto" by scanning the target for an existing goldenlook listener.
  nativeGoldenLook: false,
  goldenRuntimeAsset: './golden-ai3d-playable-runtime.js',
  selectors: {
    navigatorPanel: [
      '[data-navigator-panel]', '#navigatorPanel', '.navigator-panel',
      '.navigator', '.navigator-card', '.dialog-panel', '.chat-panel'
    ],
    navigatorInput: [
      '[data-navigator-input]', '#navigatorInput', 'textarea',
      'input[type="text"]'
    ],
    // Never auto-scale a canvas. Three.js/WebGL eyes must use registerEyeObject().
    eyeDom: [
      '[data-player-eye]', '#playerEye', '.player-eye', '.eye-avatar'
    ],
    gameSurface: [
      '[data-game-canvas]', 'canvas.game-canvas', '#gameCanvas', '#canvas', 'canvas'
    ],
    mobileHint: [
      '[data-control-hint]', '.control-hint', '.controls-hint', '.top-hint', '.help-hint'
    ]
  },
  secondaryActionText: ['Отменить', 'Вернуть', 'Глаз: камера'],
  hintTextFragments: ['Стрелки — движение', 'мышь — обзор', 'Esc — отпустить']
});
