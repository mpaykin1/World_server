/* Precipitation kinds — one GPU point cloud wrapped around the camera (engine/86_events.js).
     color · size (world units) · fall (units/s; negative rises) · sway · alpha
     shape: 0 soft flake / mote, 1 rain streak, 2 ash flake · additive + glow (bloom picks it up)
     box: size of the wrapped field (smaller = denser) */
defineWeather('rain', { color: '#a9c2ee', size: 0.32, fall: 15, sway: 0.05, shape: 1, alpha: 0.45, box: 24 });
defineWeather('snow', { color: '#f3f7ff', size: 0.09, fall: 1.3, sway: 0.6, shape: 0, alpha: 0.92 });
defineWeather('ash', { color: '#5e5664', size: 0.085, fall: 0.7, sway: 0.5, shape: 2, alpha: 0.85 });
defineWeather('embers', { color: '#ff9a3c', size: 0.06, fall: -0.8, sway: 0.5, shape: 0, alpha: 1, additive: true, glow: 2.2 });
defineWeather('spores', { color: '#b6ff8c', size: 0.065, fall: 0.18, sway: 0.9, shape: 0, alpha: 0.85, additive: true, glow: 1.6 });
defineWeather('stardust', { color: '#ffe2a8', size: 0.055, fall: 0.5, sway: 0.25, shape: 0, alpha: 0.9, additive: true, glow: 2.4 });
defineWeather('sea_mist', { color: '#d3dcff', size: 0.2, fall: 0.05, sway: 1.2, shape: 0, alpha: 0.22, box: 22 });
