const fs = require("fs");
const path = require("path");

const root = process.cwd();
const required = [
  "shared/progressive-onboarding.runtime.js",
  "shared/progressive-onboarding.css",
  "data/onboarding-policy.json"
];
let failed = false;
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error("MISSING", rel); failed = true;
  }
}
if (!failed) {
  const policy = JSON.parse(fs.readFileSync(path.join(root,"data/onboarding-policy.json"),"utf8"));
  const h = policy.hardRequirements || {};
  const checks = [
    [h.maxQuestionsBeforeFirstVisualReward <= 3, "maxQuestionsBeforeFirstVisualReward <= 3"],
    [h.skipAvailableOnEveryQuestion === true, "skip on every question"],
    [h.registrationMayBlockFirstVisualReward === false, "no auth before first reward"],
    [h.deepQuestionnaireMayBlockFirstVisualReward === false, "deep questionnaire cannot block reward"],
    [h.preserveExistingDeepQuestions === true, "preserve deep questions"]
  ];
  for (const [ok, label] of checks) {
    console.log(ok ? "PASS" : "FAIL", label);
    if (!ok) failed = true;
  }

  const htmlFiles = [];
  function walk(dir, depth=0) {
    if (depth > 5) return;
    for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
      if (["node_modules",".git",".next","dist","build",".vercel"].includes(ent.name)) continue;
      const p = path.join(dir,ent.name);
      if (ent.isDirectory()) walk(p,depth+1);
      else if (ent.name.toLowerCase()==="index.html") htmlFiles.push(p);
    }
  }
  walk(root);
  const injected = htmlFiles.filter(f => {
    const s=fs.readFileSync(f,"utf8");
    return s.includes("progressive-onboarding.runtime.js") && s.includes("progressive-onboarding.css");
  });
  if (!injected.length) {
    console.error("FAIL no index.html contains progressive onboarding assets");
    failed = true;
  } else {
    injected.forEach(f=>console.log("PASS integrated",path.relative(root,f)));
  }
}
process.exit(failed ? 1 : 0);
