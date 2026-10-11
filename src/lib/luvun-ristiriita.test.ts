import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  edustavaLuku,
  poimiPintaAlaHa,
  poimiTehoMw,
  rakennaLuvunRistiriitaRivit,
} from "./luvun-ristiriita";

describe("poimiPintaAlaHa", () => {
  it("poimii hehtaarit eikä megawatteja", () => {
    const luvut = poimiPintaAlaHa(
      "Helios develops an 80-hectare data center with a target capacity of up to 500 MW",
    );
    assert.deepEqual(
      luvut.map((l) => l.luku),
      [80],
    );
  });

  it("muuntaa neliömetrit hehtaareiksi", () => {
    const luvut = poimiPintaAlaHa("The combined area totals approximately 800,000 sqm");
    assert.equal(edustavaLuku(luvut)?.luku, 80);
  });

  it("poimii kaava-alueen", () => {
    const luvut = poimiPintaAlaHa("Kaava-alueen pinta-ala on 3,8 hehtaaria.");
    assert.equal(edustavaLuku(luvut)?.luku, 3.8);
  });
});

describe("poimiTehoMw", () => {
  it("poimii MW-luvut ja vaihteluvälin", () => {
    const luvut = poimiTehoMw(
      "Datakeskushankkeen kokoluokaksi on arvioitu 500 – 600 MW.",
    );
    assert.deepEqual(
      luvut.map((l) => l.luku).sort((a, b) => a - b),
      [500, 600],
    );
  });
});

describe("rakennaLuvunRistiriitaRivit", () => {
  it("löytää eri pinta-alat", () => {
    const rivit = rakennaLuvunRistiriitaRivit(
      [
        {
          id: "a",
          taulu: "hankkeet",
          rivi_id: "h1",
          kentta: "pinta_ala_ha",
          lahde_url: "https://a.example/",
          lainaus: "Kaava-alueen pinta-ala on 40 hehtaaria.",
          luottamus: "epavarma",
          merkitty: "koneen_ehdottama",
          tila: "voimassa",
        },
        {
          id: "b",
          taulu: "hankkeet",
          rivi_id: "h1",
          kentta: "pinta_ala_ha",
          lahde_url: "https://b.example/",
          lainaus: "Tontti on 12 hehtaaria.",
          luottamus: "epavarma",
          merkitty: "koneen_ehdottama",
          tila: "voimassa",
        },
      ],
      [
        {
          id: "h1",
          nimi: "Testi",
          kunta: "Espoo",
          teho_mw: null,
          it_teho_mw: null,
          pinta_ala_ha: 40,
          kaava_ala_ha: null,
          sahkonkaytto_twh_a: null,
          generaattorit_lkm: null,
          generaattorit_kaytossa_max_lkm: null,
          generaattori_polttoaineteho_mw: null,
          generaattori_yksikkoteho_mwe: null,
          diesel_vuosikulutus_maara: null,
          varavoima_paastot_t_co2e: null,
        },
      ],
      new Set(),
    );
    assert.equal(rivit.length, 1);
    assert.deepEqual(
      rivit[0]!.lahteet.map((l) => l.luku).sort((a, b) => a - b),
      [12, 40],
    );
  });
});
