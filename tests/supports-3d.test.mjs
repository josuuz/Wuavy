// Every way out of the model must keep working: where any of these says no,
// the drawn Pulse is what people get, and nothing 3D is fetched.
import test from "node:test";
import assert from "node:assert/strict";

import { supports3D } from "../src/components/flow/supports-3d.ts";

/** A browser, as healthy as asked for. */
function browser({ perf = null, saveData = false, cores = 8, memory = 8, webgl = true } = {}) {
  const lost = [];
  const gl = webgl ? { getExtension: () => ({ loseContext: () => lost.push(true) }) } : null;
  return {
    lost,
    document: {
      documentElement: { getAttribute: (name) => (name === "data-perf" ? perf : null) },
      createElement: () => ({ getContext: () => gl }),
    },
    navigator: { hardwareConcurrency: cores, deviceMemory: memory, connection: { saveData } },
  };
}

/** Node has a navigator of its own, so put both back the way they were. */
function asking(parts) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "document", { value: parts.document, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: parts.navigator, configurable: true });
  try {
    return supports3D();
  } finally {
    delete globalThis.document;
    if (had) Object.defineProperty(globalThis, "navigator", had);
    else delete globalThis.navigator;
  }
}

test("a machine with room for it carries the model", () => {
  assert.equal(asking(browser()), true);
});

test("the app's own lite verdict is final", () => {
  // app/layout.tsx decides this before first paint — a coarse pointer, few
  // cores, little memory. The model must not argue with it.
  assert.equal(asking(browser({ perf: "lite" })), false);
});

test("someone saving data is not sent 383 KB", () => {
  assert.equal(asking(browser({ saveData: true })), false);
});

test("two cores keep the drawing", () => {
  assert.equal(asking(browser({ cores: 2 })), false);
});

test("two gigabytes keep the drawing", () => {
  assert.equal(asking(browser({ memory: 2 })), false);
});

test("no WebGL keeps the drawing", () => {
  assert.equal(asking(browser({ webgl: false })), false);
});

test("asking does not sit on a WebGL context", () => {
  // A browser allows only a handful at once; the probe must give its own back.
  const parts = browser();
  asking(parts);
  assert.equal(parts.lost.length, 1);
});

test("on the server there is nothing to ask", () => {
  assert.equal(supports3D(), false);
});
