import assert from "node:assert/strict";
import test from "node:test";
import {
  MAARAAIKA_HUOMIO_PAIVAT,
  helsinkiKalenteripaiva,
  maaraajaHuomio,
  maaraajaOnAuki,
  paiviaJaljellaPaattyy,
} from "./maaraaja-huomio";

/** Kiinnitä "nyt" UTC-hetkeen; Helsinki-laskenta tapahtuu funktiossa. */
function utc(iso: string): Date {
  return new Date(iso);
}

test("vakio on 7", () => {
  assert.equal(MAARAAIKA_HUOMIO_PAIVAT, 7);
});

test("helsinkiKalenteripaiva klo 23:30 UTC on jo seuraava päivä Suomessa (EEST)", () => {
  // 2026-10-12 23:30 UTC = 2026-10-13 02:30 Europe/Helsinki (UTC+3)
  assert.equal(helsinkiKalenteripaiva(utc("2026-10-12T23:30:00.000Z")), "2026-10-13");
});

test("päiviä jäljellä: tänään 0, huomenna 1, 6, 7, 8", () => {
  const nyt = utc("2026-10-13T10:00:00.000Z"); // Helsinki 13.10. klo 13
  assert.equal(helsinkiKalenteripaiva(nyt), "2026-10-13");
  assert.equal(paiviaJaljellaPaattyy("2026-10-13", nyt), 0);
  assert.equal(paiviaJaljellaPaattyy("2026-10-14", nyt), 1);
  assert.equal(paiviaJaljellaPaattyy("2026-10-19", nyt), 6);
  assert.equal(paiviaJaljellaPaattyy("2026-10-20", nyt), 7);
  assert.equal(paiviaJaljellaPaattyy("2026-10-21", nyt), 8);
  assert.equal(paiviaJaljellaPaattyy("2026-10-12", nyt), -1);
});

test("huomio: 0–7 kyllä, 8 ja menneisyys ei", () => {
  const nyt = utc("2026-10-13T10:00:00.000Z");
  assert.equal(maaraajaHuomio(null, "2026-10-13", nyt)?.teksti, "! tänään");
  assert.equal(maaraajaHuomio(null, "2026-10-14", nyt)?.teksti, "! huomenna");
  assert.equal(maaraajaHuomio(null, "2026-10-15", nyt)?.teksti, "! 2 pv");
  assert.equal(maaraajaHuomio(null, "2026-10-20", nyt)?.teksti, "! 7 pv");
  assert.equal(maaraajaHuomio(null, "2026-10-21", nyt), null);
  assert.equal(maaraajaHuomio(null, "2026-10-12", nyt), null);
});

test("aria-labelit", () => {
  const nyt = utc("2026-10-13T10:00:00.000Z");
  assert.equal(
    maaraajaHuomio(null, "2026-10-13", nyt)?.ariaLabel,
    "Määräaika lähestyy: päättyy tänään",
  );
  assert.equal(
    maaraajaHuomio(null, "2026-10-14", nyt)?.ariaLabel,
    "Määräaika lähestyy: 1 päivä jäljellä",
  );
  assert.equal(
    maaraajaHuomio(null, "2026-10-16", nyt)?.ariaLabel,
    "Määräaika lähestyy: 3 päivää jäljellä",
  );
});

test("kesäajan vaihtuminen 24.–26.10.2026: kalenteripäivät, ei 24 h -jaksoja", () => {
  // Viimeinen sunnuntai loka: kelloja siirretään 25.10.2026 yö (EEST→EET).
  const lauantai = utc("2026-10-24T12:00:00.000Z"); // Helsinki 24.10. 15:00
  assert.equal(helsinkiKalenteripaiva(lauantai), "2026-10-24");
  assert.equal(paiviaJaljellaPaattyy("2026-10-25", lauantai), 1);
  assert.equal(paiviaJaljellaPaattyy("2026-10-26", lauantai), 2);

  const sunnuntaiAamu = utc("2026-10-25T06:00:00.000Z"); // Helsinki 25.10. 09:00 EEST vielä
  assert.equal(helsinkiKalenteripaiva(sunnuntaiAamu), "2026-10-25");
  assert.equal(paiviaJaljellaPaattyy("2026-10-26", sunnuntaiAamu), 1);

  const maanantai = utc("2026-10-26T10:00:00.000Z"); // Helsinki 26.10. 12:00 EET
  assert.equal(helsinkiKalenteripaiva(maanantai), "2026-10-26");
  assert.equal(paiviaJaljellaPaattyy("2026-10-26", maanantai), 0);
  assert.equal(maaraajaHuomio(null, "2026-10-26", maanantai)?.teksti, "! tänään");
});

test("vuodenvaihde", () => {
  const nyt = utc("2026-12-30T12:00:00.000Z"); // Helsinki 30.12.
  assert.equal(helsinkiKalenteripaiva(nyt), "2026-12-30");
  assert.equal(paiviaJaljellaPaattyy("2027-01-01", nyt), 2);
  assert.equal(maaraajaHuomio(null, "2027-01-01", nyt)?.teksti, "! 2 pv");
  assert.equal(maaraajaHuomio(null, "2027-01-06", nyt)?.teksti, "! 7 pv");
  assert.equal(maaraajaHuomio(null, "2027-01-07", nyt), null);
});

test("päivämäärä ilman kellonaikaa (YYYY-MM-DD)", () => {
  const nyt = utc("2026-03-01T10:00:00.000Z");
  assert.equal(paiviaJaljellaPaattyy("2026-03-05", nyt), 4);
  assert.equal(maaraajaHuomio(null, "2026-03-05T00:00:00Z", nyt)?.teksti, "! 4 pv");
});

test("aukiolo: alkaa tulevaisuudessa → ei huomio", () => {
  const nyt = utc("2026-10-13T10:00:00.000Z");
  assert.equal(maaraajaOnAuki("2026-10-15", "2026-10-20", nyt), false);
  assert.equal(maaraajaHuomio("2026-10-15", "2026-10-20", nyt), null);
});

test("aukiolo: yhden päivän jakso tänään", () => {
  const nyt = utc("2026-10-13T10:00:00.000Z");
  assert.equal(maaraajaOnAuki("2026-10-13", "2026-10-13", nyt), true);
  assert.equal(maaraajaHuomio("2026-10-13", "2026-10-13", nyt)?.teksti, "! tänään");
});

test("aukiolo: alkaa_pvm null ja paattyy tulevaisuudessa", () => {
  const nyt = utc("2026-10-13T10:00:00.000Z");
  assert.equal(maaraajaOnAuki(null, "2026-10-18", nyt), true);
  assert.equal(maaraajaHuomio(null, "2026-10-18", nyt)?.teksti, "! 5 pv");
});
