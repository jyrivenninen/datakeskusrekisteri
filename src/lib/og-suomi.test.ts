import assert from "node:assert/strict";
import test from "node:test";
import { projisoiKartta, suomiPolku } from "./og-suomi";
import { hankeOgKuvaus } from "./sivuston-metatiedot";

test("etelä on kartalla pohjoista alempana", () => {
  const helsinki = projisoiKartta(24.94, 60.17, 440, 560);
  const rovaniemi = projisoiKartta(25.73, 66.5, 440, 560);
  assert.ok(helsinki.y > rovaniemi.y);
  assert.ok(helsinki.x > 0 && helsinki.x < 440);
  assert.ok(rovaniemi.y > 0 && rovaniemi.y < 560);
});

test("rantaviiva on suljettu polku", () => {
  const polku = suomiPolku(440, 560);
  assert.match(polku, /^M/);
  assert.match(polku, /Z$/);
});

test("hankkeen jakokuvaus kokoaa nimen, kunnan, vaiheen ja tehon", () => {
  assert.equal(
    hankeOgKuvaus({
      nimi: "Hyperco Pyhäjoki, Keskikylä",
      kunta: "Pyhäjoki",
      vaihe: "kaavoitus",
      teho_mw: 370,
      it_teho_mw: null,
    }),
    "Hyperco Pyhäjoki, Keskikylä. Pyhäjoki. Kaavoitus. 370 MW.",
  );
  assert.equal(
    hankeOgKuvaus({
      nimi: "Esimerkki",
      kunta: "Vaala",
      vaihe: "yva_vireilla",
      teho_mw: null,
      it_teho_mw: null,
    }),
    "Esimerkki. Vaala. YVA vireillä.",
  );
});
