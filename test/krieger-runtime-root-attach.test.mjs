import test from "node:test";
import assert from "node:assert/strict";
import {findViewportTemplate} from "../tools/krieger-total-control/kx-runtime-root-attach.mjs";

test("root attachment API rejects a document without a reachable Viewport",()=>{
  const fake=Buffer.alloc(0);
  assert.throws(()=>findViewportTemplate(fake),/truncated|root slot|header/i);
});
