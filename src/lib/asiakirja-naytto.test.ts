import assert from "node:assert/strict";
import test from "node:test";
import { viimeisinAsiakirjaHakuPvm } from "./asiakirja-naytto";
import type { Dokumentti, KenttaLahde } from "./supabase/tietokanta";

const perusDok: Dokumentti = {
  id: "11111111-1111-4111-8111-111111111111",
  hanke_id: "h",
  url: "https://example.fi/a.pdf",
  otsikko: "Testi",
  laji: "verkkosivu",
  muoto: null,
  kieli: null,
  julkaisija: null,
  julkaistu_pvm: null,
  tunnus: null,
  sivumaara: null,
  menettely_id: null,
  lahde_tyyppi: "muu",
  sitovuustaso: "epavirallinen",
  otsikko_automaattinen: false,
  lahde_metatiedot_kasitelty_pvm: null,
  julkaistu: true,
  sisalto_tiiviste: null,
  kanoninen_dokumentti_id: null,
  luotu_pvm: "2026-01-01T00:00:00.000Z",
  paivitetty_pvm: "2026-03-15T00:00:00.000Z",
};

test("viimeisin haku: rekisterin päivitys vs lähdevahvistus", () => {
  const lahteet = [
    {
      vahvistettu_pvm: "2026-02-01",
      lahde_url: perusDok.url,
      dokumentti_id: perusDok.id,
      tekninen_lahde: false,
      taulu: "hankkeet",
    },
  ] as KenttaLahde[];

  assert.equal(viimeisinAsiakirjaHakuPvm(perusDok, lahteet), "2026-03-15");
});
