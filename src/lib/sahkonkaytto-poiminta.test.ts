import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSuomalainenLuku,
  poimiSahkonkayttoTekstista,
  poimiYmparistoPdfUrlit,
} from "./sahkonkaytto-poiminta";

test("parseSuomalainenLuku", () => {
  assert.equal(parseSuomalainenLuku("1 512"), 1512);
  assert.equal(parseSuomalainenLuku("3,2"), 3.2);
});

test("poimi GWh vuosikulutus", () => {
  const t =
    "Hankkeen vuotuinen sähkönkulutus on arviolta noin 1512 GWh. Vertailukohteena Uudenmaan";
  const o = poimiSahkonkayttoTekstista(t);
  assert.ok(o);
  assert.equal(o!.twh_a, 1.512);
  assert.equal(o!.luottamus, "epavarma");
});

test("poimi TWh Hyperco-tyyli", () => {
  const t =
    "Karkeasti yksinkertaistaen 370 MW:n datakeskus kuluttaisi 100 % kuormitustasolla vuodessa noin 3,2 TWh sähköä.";
  const o = poimiSahkonkayttoTekstista(t);
  assert.ok(o);
  assert.equal(o!.twh_a, 3.2);
});

test("ei poimi pelkkää MW:ta", () => {
  const o = poimiSahkonkayttoTekstista("Hankkeen IT-teho on 500 MW.");
  assert.equal(o, null);
});

test("poimiYmparistoPdfUrlit", () => {
  const html =
    '<a href="https://www.ymparisto.fi/sites/default/files/documents/Foo%20YVA.pdf">pdf</a>';
  assert.deepEqual(poimiYmparistoPdfUrlit(html), [
    "https://www.ymparisto.fi/sites/default/files/documents/Foo YVA.pdf",
  ]);
});
