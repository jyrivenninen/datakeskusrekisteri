import assert from "node:assert/strict";
import { test } from "node:test";
import { johdaKuntaSlug, kuntaSivuPolku } from "./kunta-slug";

test("johdaKuntaSlug normalisoi ääkköset ja välilyönnit", () => {
  assert.equal(johdaKuntaSlug("Tuusula"), "tuusula");
  assert.equal(johdaKuntaSlug("Jyväskylä"), "jyvaskyla");
  assert.equal(johdaKuntaSlug("Åland"), "aland");
  assert.equal(johdaKuntaSlug("Koski Tl"), "koski-tl");
  assert.equal(johdaKuntaSlug("  Raasepori  "), "raasepori");
});

test("kuntaSivuPolku", () => {
  assert.equal(kuntaSivuPolku("tuusula"), "/kunnat/tuusula");
});
