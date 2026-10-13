import assert from "node:assert/strict";
import test from "node:test";
import {
  ESIVERSIO_DATA_ATTR,
  ESIVERSIO_DATA_ARVO,
  ESIVERSIO_EVASTE,
  ESIVERSIO_EVASTE_ARVO,
  ESIVERSIO_EVASTE_MAX_AGE_S,
  ESIVERSIO_INLINE_SKRIPTI,
  esiversioKuittausSetCookie,
  onkoEsiversioKuitattuEvasteesta,
  parsiEvasteArvo,
} from "./esiversio";

test("vakio: nimi, arvo ja 30 vrk", () => {
  assert.equal(ESIVERSIO_EVASTE, "esiversio_kuitattu");
  assert.equal(ESIVERSIO_EVASTE_ARVO, "kylla");
  assert.equal(ESIVERSIO_EVASTE_MAX_AGE_S, 60 * 60 * 24 * 30);
});

test("ei evästettä → ei kuitattu", () => {
  assert.equal(onkoEsiversioKuitattuEvasteesta(null), false);
  assert.equal(onkoEsiversioKuitattuEvasteesta(undefined), false);
  assert.equal(onkoEsiversioKuitattuEvasteesta(""), false);
  assert.equal(onkoEsiversioKuitattuEvasteesta("muu=1"), false);
});

test("oikea eväste → kuitattu", () => {
  assert.equal(
    onkoEsiversioKuitattuEvasteesta("esiversio_kuitattu=kylla"),
    true,
  );
  assert.equal(
    onkoEsiversioKuitattuEvasteesta("a=1; esiversio_kuitattu=kylla; b=2"),
    true,
  );
});

test("vanha sama eväste (väliavaruudet) → kuitattu", () => {
  assert.equal(
    onkoEsiversioKuitattuEvasteesta("  esiversio_kuitattu=kylla  "),
    true,
  );
  assert.equal(parsiEvasteArvo("esiversio_kuitattu=kylla"), "kylla");
});

test("virheellinen arvo → ei kuitattu", () => {
  assert.equal(onkoEsiversioKuitattuEvasteesta("esiversio_kuitattu=yes"), false);
  assert.equal(onkoEsiversioKuitattuEvasteesta("esiversio_kuitattu="), false);
  assert.equal(onkoEsiversioKuitattuEvasteesta("esiversio_kuitattu"), false);
});

test("Set-Cookie säilyttää nimen, arvon ja Max-Agen", () => {
  const rivi = esiversioKuittausSetCookie();
  assert.match(rivi, /^esiversio_kuitattu=kylla;/);
  assert.match(rivi, /Max-Age=2592000/);
  assert.match(rivi, /Path=\//);
  assert.match(rivi, /SameSite=Lax/);
  assert.doesNotMatch(rivi, /HttpOnly/i);
});

test("inline-skripti sisältää nimen ja data-attribuutin, ei kaadu syntaksina", () => {
  assert.match(ESIVERSIO_INLINE_SKRIPTI, /esiversio_kuitattu/);
  assert.match(ESIVERSIO_INLINE_SKRIPTI, /try\{/);
  assert.match(ESIVERSIO_INLINE_SKRIPTI, /catch/);
  assert.match(ESIVERSIO_INLINE_SKRIPTI, new RegExp(ESIVERSIO_DATA_ATTR));
  assert.match(ESIVERSIO_INLINE_SKRIPTI, new RegExp(ESIVERSIO_DATA_ARVO));
  // eslint-disable-next-line no-new-func -- testaa että skripti on kelvollista JS:ää
  assert.doesNotThrow(() => new Function(ESIVERSIO_INLINE_SKRIPTI));
});

test("parsiEvasteArvo ei kaadu omituisella syötteellä", () => {
  assert.equal(parsiEvasteArvo(";;;"), null);
  assert.equal(parsiEvasteArvo("=vainarvo"), null);
  assert.equal(parsiEvasteArvo("a=b=c; esiversio_kuitattu=kylla"), "kylla");
});
