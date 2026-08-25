const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "apps");
const marker = '<script src="/shared/sentry-runtime.js"></script>';

let changed = 0;
let already = 0;
let skipped = 0;

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);

    if (item.isDirectory()) {
      walk(full);
      continue;
    }

    if (!item.isFile() || !item.name.toLowerCase().endsWith(".html")) {
      continue;
    }

    const relative = path.relative(root, full);
    const parts = relative.split(path.sep).map(part => part.toLowerCase());

    // Не изменяем baseline/служебные HTML-ассеты.
    if (
      item.name.toLowerCase().includes("baseline") ||
      parts.includes("assets")
    ) {
      skipped++;
      console.log("SKIP:", relative);
      continue;
    }

    let html = fs.readFileSync(full, "utf8");

    if (html.includes("/shared/sentry-runtime.js")) {
      already++;
      continue;
    }

    if (!/<\/head>/i.test(html)) {
      skipped++;
      console.warn("SKIP (no </head>):", relative);
      continue;
    }

    html = html.replace(
      /<\/head>/i,
      `  ${marker}\n</head>`
    );

    fs.writeFileSync(full, html, "utf8");

    changed++;
    console.log("SENTRY ADDED:", relative);
  }
}

walk(root);

console.log("");
console.log("Changed:", changed);
console.log("Already connected:", already);
console.log("Skipped:", skipped);
console.log("Sentry runtime injection: DONE");
