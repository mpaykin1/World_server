function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const rawSeed = String((req.query && req.query.seed) || "interrogation-room-v2").slice(0, 96);
  const seed = hash32(rawSeed);
  const rnd = mulberry32(seed);

  const dirt = Array.from({ length: 110 }, () => ({
    x: 6 + Math.floor(rnd() * 148),
    y: 8 + Math.floor(rnd() * 64),
    s: 1 + Math.floor(rnd() * 2),
    a: +(0.025 + rnd() * 0.075).toFixed(3)
  }));

  const cracks = Array.from({ length: 14 }, () => ({
    x: 10 + Math.floor(rnd() * 140),
    y: 12 + Math.floor(rnd() * 55),
    len: 2 + Math.floor(rnd() * 7),
    dir: rnd() > .5 ? 1 : -1
  }));

  res.status(200).json({
    version: 2,
    seed: rawSeed,
    render: { width: 160, height: 90, targetFps: 60, pixelated: true },
    palette: {
      void: "#101010",
      wall: "#282828",
      wallDark: "#1d1d1d",
      floor: "#202020",
      ink: "#050505",
      wood: "#472b09",
      woodHi: "#55340b",
      skin: "#8a7c42",
      cloth: "#090b0f",
      bulb: "#d1d15d",
      glow: "#9f9d39"
    },
    animation: {
      breathHz: 1.9 + rnd() * .35,
      breathPx: .45 + rnd() * .2,
      handHz: 1.05 + rnd() * .45,
      handPx: .5 + rnd() * .55,
      headHz: .23 + rnd() * .12,
      headPx: .25 + rnd() * .3,
      shadowHz: .45 + rnd() * .2,
      shadowPx: .7 + rnd() * .7,
      blinkHz: .5 + rnd() * .25,
      flickerA: 8 + rnd() * 5,
      flickerB: 18 + rnd() * 9,
      flickerDropHz: 1.6 + rnd() * 1.0
    },
    dirt,
    cracks,
    serverGeneratedAt: new Date().toISOString()
  });
};
