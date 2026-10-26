import assert from "node:assert/strict";
import test from "node:test";
import type { AvoinDataHanke } from "./avoin-data";
import { lataaSqlJs, rakennaHankkeetGeopackage } from "./geopackage";

function hanke(): AvoinDataHanke {
  return {
    hanke: {
      id: "hanke-1",
      nimi: "Testihanke",
      kunta: "Helsinki",
      maakunta: "Uusimaa",
      vaihe: "yva_vireilla",
      teho_mw: 10,
      it_teho_mw: 8,
      pinta_ala_ha: 2,
      sahkonkaytto_twh_a: 0.1,
      sijainti_lat: 60.17,
      sijainti_lon: 24.94,
      sijainti_alue: {
        type: "Polygon",
        coordinates: [
          [
            [24.9, 60.1],
            [25.0, 60.1],
            [25.0, 60.2],
            [24.9, 60.1],
          ],
        ],
      },
      toimija: { id: "org-1", nimi: "Testi Oy" },
    },
    johdot: [
      {
        id: "johto-1",
        tyyppi: "maakaapeli",
        vaihtoehto: "VE1",
        jannite_kv: 110,
        pituus_km: 4,
        reitti: {
          type: "LineString",
          coordinates: [
            [24.94, 60.17],
            [24.95, 60.18],
          ],
        },
      },
    ],
    linkit: { json: "https://example.test/hankkeet/hanke-1/json" },
  } as unknown as AvoinDataHanke;
}

test("geopackage sisältää pisteen, alueen ja johtoreitin", async () => {
  const tavuina = await rakennaHankkeetGeopackage([hanke()]);
  assert.ok(tavuina.byteLength > 200);
  const SQL = await lataaSqlJs();
  const db = new SQL.Database(tavuina);
  const sovellus = db.exec("PRAGMA application_id");
  assert.equal(sovellus[0]?.values[0]?.[0], 1196444487);
  const pisteet = db.exec("SELECT nimi, kunta FROM hankkeet_pisteet");
  assert.deepEqual(pisteet[0]?.values, [["Testihanke", "Helsinki"]]);
  const alueet = db.exec("SELECT count(*) FROM hankkeet_alueet");
  assert.equal(alueet[0]?.values[0]?.[0], 1);
  const viivat = db.exec("SELECT hanke_nimi, tyyppi FROM johtoreitit");
  assert.deepEqual(viivat[0]?.values, [["Testihanke", "maakaapeli"]]);
  for (const taulu of ["hankkeet_pisteet", "hankkeet_alueet", "johtoreitit"]) {
    const tyyppi = db.exec(`SELECT typeof(geom) FROM ${taulu}`);
    assert.equal(tyyppi[0]?.values[0]?.[0], "blob");
    const geom = db.exec(`SELECT geom FROM ${taulu}`);
    const blob = geom[0]?.values[0]?.[0];
    assert.ok(blob instanceof Uint8Array);
    const tavut = blob as Uint8Array;
    assert.equal(tavut[0], 0x47);
    assert.equal(tavut[1], 0x50);
    assert.equal(tavut[3], 0x03);
    assert.equal(tavut[3]! & 0x10, 0);
    const view = new DataView(tavut.buffer, tavut.byteOffset, tavut.byteLength);
    const minX = view.getFloat64(8, true);
    const maxX = view.getFloat64(16, true);
    const minY = view.getFloat64(24, true);
    const maxY = view.getFloat64(32, true);
    assert.ok(minX >= 19 && maxX <= 32 && minY >= 59 && maxY <= 71);
    if (taulu === "hankkeet_pisteet") {
      assert.ok(Math.abs(minX - 24.94) < 1e-9);
      assert.ok(Math.abs(minY - 60.17) < 1e-9);
    }
  }
  db.close();
});

test("vienti hylkää Suomen ulkopuolisen kehyksen eikä palauta tiedostoa", async () => {
  const rivi = hanke();
  rivi.hanke.sijainti_lon = 0;
  rivi.hanke.sijainti_lat = 0;
  rivi.hanke.sijainti_alue = null;
  rivi.johdot = [];
  await assert.rejects(() => rakennaHankkeetGeopackage([rivi]), /Suomen alueella/);
});
