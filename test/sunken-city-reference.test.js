"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validate } = require("../scripts/check-sunken-city-reference.cjs");

test("sunken city graphics pack is complete and reproducible", () => {
  const result = validate();
  assert.equal(result.status, "PASS");
  assert.equal(result.models, 76);
  assert.equal(result.animated_models, 52);
  assert(result.referenced_assets >= 1000);
});
