import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ESIVERSIO_DATA_ATTR,
  ESIVERSIO_DATA_KUITATTU,
  ESIVERSIO_DATA_NAYTA,
  ESIVERSIO_EVASTE,
  ESIVERSIO_EVASTE_ARVO,
  ESIVERSIO_EVASTE_MAX_AGE_S,
  ESIVERSIO_INLINE_SKRIPTI,
  ESIVERSIO_KRITTIINEN_CSS,
  ESIVERSIO_NOSCRIPT_CSS,
  esiversioDataArvoDocumentCookiesta,
  esiversioDataArvoEvasteesta,
  esiversioHeadMerkkijono,
  esiversioKuittausSetCookie,
  onkoEsiversioKuitattuEvasteesta,
  parsiEvasteArvo,
} from "./esiversio";

test("vakio: nimi, arvo ja 30 vrk", () => {
  assert.equal(ESIVERSIO_EVASTE, "esiversio_kuitattu");
  assert.equal(ESIVERSIO_EVASTE_ARVO, "kylla");
  assert.equal(ESIVERSIO_EVASTE_MAX_AGE_S, 60 * 60 * 24 * 30);
});

test("ei evästettä → nayta", () => {
  assert.equal(esiversioDataArvoEvasteesta(null), ESIVERSIO_DATA_NAYTA);
  assert.equal(esiversioDataArvoEvasteesta(undefined), ESIVERSIO_DATA_NAYTA);
  assert.equal(esiversioDataArvoEvasteesta(""), ESIVERSIO_DATA_NAYTA);
  assert.equal(esiversioDataArvoEvasteesta("muu=1"), ESIVERSIO_DATA_NAYTA);
  assert.equal(onkoEsiversioKuitattuEvasteesta(null), false);
});

test("esiversio_kuitattu=kylla → kuitattu", () => {
  assert.equal(
    esiversioDataArvoEvasteesta("esiversio_kuitattu=kylla"),
    ESIVERSIO_DATA_KUITATTU,
  );
  assert.equal(
    esiversioDataArvoEvasteesta("a=1; esiversio_kuitattu=kylla; b=2"),
    ESIVERSIO_DATA_KUITATTU,
  );
});

test("muita evästeitä mukana → oikea tulos", () => {
  assert.equal(
    esiversioDataArvoEvasteesta("foo=bar; esiversio_kuitattu=kylla; baz=1"),
    ESIVERSIO_DATA_KUITATTU,
  );
  assert.equal(
    esiversioDataArvoEvasteesta("foo=bar; baz=1"),
    ESIVERSIO_DATA_NAYTA,
  );
});

test("virheellinen arvo → nayta", () => {
  assert.equal(
    esiversioDataArvoEvasteesta("esiversio_kuitattu=yes"),
    ESIVERSIO_DATA_NAYTA,
  );
  assert.equal(
    esiversioDataArvoEvasteesta("esiversio_kuitattu="),
    ESIVERSIO_DATA_NAYTA,
  );
  assert.equal(
    esiversioDataArvoEvasteesta("esiversio_kuitattu"),
    ESIVERSIO_DATA_NAYTA,
  );
});

test("document.cookie heittää → nayta eikä kaadu", () => {
  assert.equal(
    esiversioDataArvoDocumentCookiesta(() => {
      throw new Error("cookie blocked");
    }),
    ESIVERSIO_DATA_NAYTA,
  );
  assert.equal(
    esiversioDataArvoDocumentCookiesta(() => "esiversio_kuitattu=kylla"),
    ESIVERSIO_DATA_KUITATTU,
  );
});

test("Set-Cookie säilyttää nimen, arvon ja Max-Agen", () => {
  const rivi = esiversioKuittausSetCookie();
  assert.match(rivi, /^esiversio_kuitattu=kylla;/);
  assert.match(rivi, /Max-Age=2592000/);
  assert.match(rivi, /Path=\//);
  assert.match(rivi, /SameSite=Lax/);
  assert.doesNotMatch(rivi, /HttpOnly/i);
});

test("inline-skripti asettaa kuitattu tai nayta, try/catch", () => {
  assert.match(ESIVERSIO_INLINE_SKRIPTI, /esiversio_kuitattu/);
  assert.match(ESIVERSIO_INLINE_SKRIPTI, /try\{/);
  assert.match(ESIVERSIO_INLINE_SKRIPTI, /catch/);
  assert.match(ESIVERSIO_INLINE_SKRIPTI, new RegExp(ESIVERSIO_DATA_ATTR));
  assert.match(ESIVERSIO_INLINE_SKRIPTI, new RegExp(ESIVERSIO_DATA_KUITATTU));
  assert.match(ESIVERSIO_INLINE_SKRIPTI, new RegExp(ESIVERSIO_DATA_NAYTA));
  // eslint-disable-next-line no-new-func -- testaa että skripti on kelvollista JS:ää
  assert.doesNotThrow(() => new Function(ESIVERSIO_INLINE_SKRIPTI));
});

test("kriittinen CSS: oletus none, nayta block, ei transition", () => {
  assert.match(ESIVERSIO_KRITTIINEN_CSS, /\.esiversio-ilmoitus\{display:none\}/);
  assert.match(
    ESIVERSIO_KRITTIINEN_CSS,
    /html\[data-esiversio="nayta"\] \.esiversio-ilmoitus\{display:block\}/,
  );
  assert.doesNotMatch(ESIVERSIO_KRITTIINEN_CSS, /transition|animation/i);
  assert.match(ESIVERSIO_NOSCRIPT_CSS, /display:block/);
});

test("head-merkkijono: skripti ilman async/defer, noscript, display none", () => {
  const head = esiversioHeadMerkkijono();
  assert.match(head, /<style id="esiversio-kriittinen">/);
  assert.match(head, /<script id="esiversio-kuittaus">/);
  assert.match(head, /<noscript>/);
  assert.doesNotMatch(head, /\basync\b/);
  assert.doesNotMatch(head, /\bdefer\b/);
  assert.match(head, /display:none/);
  assert.match(head, /esiversio-noscript/);
});

test("layout.tsx: head sisältää synkronisen skriptin ja tyylit (ei next/script)", () => {
  const polku = join(dirname(fileURLToPath(import.meta.url)), "../app/layout.tsx");
  const lahde = readFileSync(polku, "utf8");
  assert.match(lahde, /<head>/);
  assert.match(lahde, /ESIVERSIO_INLINE_SKRIPTI/);
  assert.match(lahde, /ESIVERSIO_KRITTIINEN_CSS/);
  assert.match(lahde, /ESIVERSIO_NOSCRIPT_CSS/);
  assert.match(lahde, /<noscript>/);
  assert.match(lahde, /id="esiversio-kuittaus"/);
  assert.doesNotMatch(lahde, /from ["']next\/script["']/);
  assert.doesNotMatch(lahde, /beforeInteractive/);
  assert.doesNotMatch(lahde, /cookies\s*\(/);
  assert.doesNotMatch(lahde, /headers\s*\(/);
});

test("parsiEvasteArvo ei kaadu omituisella syötteellä", () => {
  assert.equal(parsiEvasteArvo(";;;"), null);
  assert.equal(parsiEvasteArvo("=vainarvo"), null);
  assert.equal(parsiEvasteArvo("a=b=c; esiversio_kuitattu=kylla"), "kylla");
});
