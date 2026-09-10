'use strict';

function worldMenuWithLore(id, baseWorldMenu, loreBible) {
  const base = baseWorldMenu || null;
  const key = loreBible?.worlds?.[id] ? id : base?.familyId;
  const story = key ? loreBible?.worlds?.[key] : null;
  if (!story) return base;

  const required = Array.isArray(loreBible.requiredElements) ? loreBible.requiredElements : [];
  const present = new Set(Array.isArray(story.elements) ? story.elements : []);
  const missing = required.filter((element) => !present.has(element));
  if (missing.length) {
    throw new Error(`World lore ${key} missing required elements: ${missing.join(', ')}`);
  }

  return { ...(base || {}), ...story };
}

module.exports = { worldMenuWithLore };
