import assert from "node:assert/strict";
import test from "node:test";
import {
  LOMAKE_KENTAT,
  parsiIlmoitusLisalahteet,
  rakennaIlmoitusSisalto,
  tarkistaUusiHanke,
  type IlmoitusKentanLahde,
} from "./ehdotus";

function lomakkeenKentat(taytetyt: Record<string, string>) {
  const kentat: Record<string, string> = {};
  const kohdat: Record<string, IlmoitusKentanLahde> = {};
  for (const kentta of LOMAKE_KENTAT) {
    kentat[kentta] = taytetyt[kentta] ?? "";
    kohdat[kentta] = { lahde_url: "", lahde_sivu: "", lainaus: "", luottamus: "" };
  }
  return { kentat, kohdat };
}

test("tyhjä rivi ohitetaan", () => {
  const tulos = parsiIlmoitusLisalahteet([""], [""]);
  assert.equal(tulos.virhe, null);
  assert.deepEqual(tulos.lisalahteet, []);
});

test("kenttä ja osoite tallentuvat", () => {
  const tulos = parsiIlmoitusLisalahteet(
    ["teho_mw", "muu"],
    ["https://example.com/a", "https://example.com/b"],
  );
  assert.equal(tulos.virhe, null);
  assert.deepEqual(tulos.lisalahteet, [
    { kentta: "teho_mw", url: "https://example.com/a", viesti: null },
    { kentta: "muu", url: "https://example.com/b", viesti: null },
  ]);
});

test("arvo tai viesti tallentuu riville", () => {
  const tulos = parsiIlmoitusLisalahteet(
    ["pinta_ala_ha", "muu"],
    ["https://example.com/a", "https://example.com/b"],
    ["noin 40 ha", "Kartta on sivun kuvassa."],
  );
  assert.equal(tulos.virhe, null);
  assert.equal(tulos.lisalahteet[0]?.viesti, "noin 40 ha");
  assert.equal(tulos.lisalahteet[1]?.viesti, "Kartta on sivun kuvassa.");
});

test("uusi hanke lähtee nimellä, kunnalla ja osoitteella", () => {
  const { kentat, kohdat } = lomakkeenKentat({
    nimi: "Testihanke",
    kunta: "Parkano",
  });
  const { sisalto, virhe } = rakennaIlmoitusSisalto(
    kentat,
    "https://example.fi/hanke",
    "",
    "",
    kohdat,
  );
  const lisat = parsiIlmoitusLisalahteet([], [], []);
  assert.equal(virhe, null);
  assert.equal(lisat.virhe, null);
  assert.equal(tarkistaUusiHanke(sisalto), null);
  assert.equal(sisalto.kentat.nimi?.lahde_url, "https://example.fi/hanke");
  assert.equal(sisalto.kentat.kunta?.arvo, "Parkano");
  assert.equal(sisalto.kentat.vaihe, undefined);
});

test("täydennys lähtee hankkeella, tiedolla ja osoitteella", () => {
  const { kentat, kohdat } = lomakkeenKentat({});
  const { sisalto, virhe } = rakennaIlmoitusSisalto(kentat, "", "", "", kohdat);
  const lisat = parsiIlmoitusLisalahteet(
    ["teho_mw"],
    ["https://example.fi/teho"],
    [""],
  );
  assert.equal(virhe, null);
  assert.equal(lisat.virhe, null);
  assert.equal(Object.keys(sisalto.kentat).length, 0);
  assert.equal(lisat.lisalahteet[0]?.viesti, null);
});

test("puoliksi täytetty rivi hylätään", () => {
  assert.match(
    parsiIlmoitusLisalahteet(["teho_mw"], [""]).virhe ?? "",
    /osoite/,
  );
  assert.match(
    parsiIlmoitusLisalahteet([""], ["https://example.com"]).virhe ?? "",
    /mitä linkki koskee/,
  );
});
