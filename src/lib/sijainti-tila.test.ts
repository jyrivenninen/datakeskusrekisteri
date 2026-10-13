import assert from "node:assert/strict";
import test from "node:test";
import {
  lainausNimeaOsoitteenTaiKoordinaatit,
  onGeokoodausTaiMenetelmaUrl,
  sijainninKentanTila,
} from "./sijainti-tila";

test("lainaus nimeää katuosoitteen", () => {
  assert.equal(
    lainausNimeaOsoitteenTaiKoordinaatit("Sijainti: Mannerheimintie 12, Helsinki"),
    true,
  );
});

test("lainaus nimeää koordinaatit", () => {
  assert.equal(lainausNimeaOsoitteenTaiKoordinaatit("60.1699, 24.9384"), true);
  assert.equal(lainausNimeaOsoitteenTaiKoordinaatit("ETRS-TM35FIN N 6670000"), true);
});

test("pelkkä paikannimi ei riitä", () => {
  assert.equal(lainausNimeaOsoitteenTaiKoordinaatit("Visulahti, Mikkeli"), false);
});

test("geokoodaus-URL ja menetelmä eivät ole vihreitä", () => {
  assert.equal(
    onGeokoodausTaiMenetelmaUrl(
      "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search?text=x",
      "rekisteri",
    ),
    true,
  );
  assert.equal(onGeokoodausTaiMenetelmaUrl("https://example.fi/doc", "menetelma"), true);
});

test("arvio ja null eivät ole vihreitä", () => {
  const lahteet = [
    {
      luottamus: "vahvistettu" as const,
      merkitty: "ihmisen_vahvistama" as const,
      tila: "voimassa",
      lahde_url: "https://example.fi/paatos",
      lainaus: "Mannerheimintie 1",
    },
  ];
  const tyypit = new Map([["https://example.fi/paatos", "paatos" as const]]);
  assert.equal(sijainninKentanTila("arvio", true, lahteet, tyypit), "vahvistamaton");
  assert.equal(sijainninKentanTila(null, true, lahteet, tyypit), "vahvistamaton");
});

test("tontti + osoite + päätös → vihreä", () => {
  const lahteet = [
    {
      luottamus: "vahvistettu" as const,
      merkitty: "ihmisen_vahvistama" as const,
      tila: "voimassa",
      lahde_url: "https://example.fi/paatos",
      lainaus: "Kiinteistö Mannerheimintie 12",
    },
  ];
  const tyypit = new Map([["https://example.fi/paatos", "paatos" as const]]);
  assert.equal(sijainninKentanTila("tontti", true, lahteet, tyypit), "vahvistettu");
});
