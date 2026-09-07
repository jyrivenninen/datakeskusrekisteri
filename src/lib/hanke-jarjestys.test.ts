import assert from "node:assert/strict";
import test from "node:test";
import { jarjestaHankkeet, parsiHankeJarjestys } from "./hanke-jarjestys";
import type { HankeListalla } from "@/lib/supabase/kyselyt";

function hanke(
  osat: Partial<HankeListalla> & Pick<HankeListalla, "id" | "nimi">,
): HankeListalla {
  return {
    kunta: "Testi",
    kunta_id: null,
    maakunta: null,
    sijainti_lat: null,
    sijainti_lon: null,
    sijainti_alue: null,
    sijainti_alue_tyyppi: null,
    kaavatunnus: null,
    kortteli: null,
    vaihe: "yva_vireilla",
    teho_mw: null,
    it_teho_mw: null,
    pinta_ala_ha: null,
    sahkonkaytto_twh_a: null,
    generaattorit_lkm: null,
    generaattorit_kaytossa_max_lkm: null,
    generaattori_polttoaineteho_mw: null,
    toimija_organisaatio_id: null,
    yva_diaarinumero: null,
    julkaistu: true,
    yhdistetty_kohde_id: null,
    poistettu_perustelu: null,
    poistettu_pvm: null,
    poistettu_kasittelija: null,
    luotu_pvm: "2026-01-01T00:00:00.000Z",
    paivitetty_pvm: "2026-01-01T00:00:00.000Z",
    toimija: null,
    vaihtoehdot: [],
    vanhin_vahvistettu_pvm: null,
    viimeisin_paatos: null,
    ...osat,
  };
}

test("parsiHankeJarjestys palauttaa oletuksen virheelliselle arvolle", () => {
  assert.equal(parsiHankeJarjestys(undefined), "nimi");
  assert.equal(parsiHankeJarjestys("tuntematon"), "nimi");
  assert.equal(parsiHankeJarjestys("teho"), "teho");
});

test("jarjestaHankkeet teho laskevasti, tyhjät viimeiseksi", () => {
  const jarjestetyt = jarjestaHankkeet(
    [
      hanke({ id: "1", nimi: "Pieni", teho_mw: 10 }),
      hanke({ id: "2", nimi: "Suuri", teho_mw: 500 }),
      hanke({ id: "3", nimi: "Tyhjä" }),
    ],
    "teho",
  );
  assert.deepEqual(
    jarjestetyt.map((h) => h.id),
    ["2", "1", "3"],
  );
});

test("jarjestaHankkeet nimi aakkosjärjestyksessä", () => {
  const jarjestetyt = jarjestaHankkeet(
    [
      hanke({ id: "1", nimi: "Zeta" }),
      hanke({ id: "2", nimi: "Alpha" }),
    ],
    "nimi",
  );
  assert.deepEqual(
    jarjestetyt.map((h) => h.nimi),
    ["Alpha", "Zeta"],
  );
});
