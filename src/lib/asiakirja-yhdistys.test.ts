import assert from "node:assert/strict";
import test from "node:test";
import { yhdistaSamannimisetAsiakirjat } from "./asiakirja-yhdistys";
import type { AsiakirjaListRivi } from "./asiakirja-yhdistys";

function rivi(url: string, kattaaLkm: number): AsiakirjaListRivi {
  return {
    id: url,
    hanke_id: "h",
    url,
    otsikko: "Mykänmaan datakeskus, Keminmaa, Tornio",
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
    luotu_pvm: "2026-01-01T00:00:00.000Z",
    paivitetty_pvm: "2026-01-01T00:00:00.000Z",
    sisalto_tiiviste: null,
    kanoninen_dokumentti_id: null,
    kattaa: Array.from({ length: kattaaLkm }, (_, i) => ({
      taulu: "hankkeet" as const,
      kentta: `kentta_${url.length}_${i}`,
      sivut: [],
    })),
    viimeisin_haku_pvm: "2026-10-10",
    meta_teksti: "",
  };
}

test("yhdistää saman otsikon eri URL:t yhdeksi riviksi", () => {
  const tulos = yhdistaSamannimisetAsiakirjat(
    [
      rivi("https://www.ymparisto.fi/Mykanmaan-datakeskus-YVA", 2),
      rivi(
        "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/mykanmaan-datakeskus-keminmaa-tornio",
        4,
      ),
    ],
    [],
  );
  assert.equal(tulos.length, 1);
  assert.match(tulos[0]!.url, /\/fi\//);
  assert.equal(tulos[0]!.kattaa.length, 6);
});
