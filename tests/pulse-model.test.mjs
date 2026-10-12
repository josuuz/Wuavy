// The model is 383 KB. It gets fetched once, and building the WebGL stage is
// not something a parent's re-render may set off. Both have gone wrong before.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { forgetPulseModel, loadPulseModel, PULSE_MODEL_URL } from "../src/components/flow/pulse-model.ts";

beforeEach(forgetPulseModel);

test("the model lives in the public folder", () => {
  assert.equal(PULSE_MODEL_URL, "/pulse.glb");
});

test("mounts asking at once share a single download", async () => {
  let asked = 0;
  const bytes = new ArrayBuffer(8);
  const fetcher = () => {
    asked += 1;
    return Promise.resolve(bytes);
  };

  const answers = await Promise.all([loadPulseModel(fetcher), loadPulseModel(fetcher), loadPulseModel(fetcher)]);

  assert.equal(asked, 1, "three mounts must not cost three downloads");
  for (const answer of answers) assert.equal(answer, bytes);
});

test("a later mount is given the bytes already here", async () => {
  let asked = 0;
  const fetcher = () => {
    asked += 1;
    return Promise.resolve(new ArrayBuffer(8));
  };

  const first = await loadPulseModel(fetcher);
  const second = await loadPulseModel(fetcher);

  assert.equal(asked, 1);
  assert.equal(second, first);
});

test("a failed download is not remembered", async () => {
  let asked = 0;
  const offline = () => {
    asked += 1;
    return Promise.reject(new Error("offline"));
  };

  await assert.rejects(loadPulseModel(offline));
  await assert.rejects(loadPulseModel(offline));

  assert.equal(asked, 2, "a mount after a failure must be free to try again");
});

test("the stage is built for a mount, not for a render", () => {
  /*
    This reads the source because the behaviour needs a DOM and the runner has
    none; the browser check is in the Playwright pass. What it guards is exact:
    the effect that creates the WebGLRenderer must depend on `failed` alone.
    List a prop there — onReady and onFail used to be listed — and every
    re-render above tears the context down and fetches the model again.
  */
  const source = readFileSync(new URL("../src/components/flow/Pulse3D.tsx", import.meta.url), "utf8");
  assert.match(source, /\n {2}}, \[failed\]\);/, "Pulse3D's stage effect should depend on [failed] and nothing else");
  assert.doesNotMatch(source, /\n {2}}, \[[^\]]*on(Ready|Fail)[^\]]*\]\);/, "callbacks must not be effect dependencies");
});
