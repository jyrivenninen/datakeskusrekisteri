import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kaytettavatLahdeTyypit,
  onLahdeTyyppiNosto,
  parsiLahdeTyyppiPaatokset,
  type LahdeTyyppiRistiriita,
} from "./uusi-hanke-lahde-tyyppi-ristiriita";
import type { UusiHankeTuonti } from "./uusi-hanke-tuonti";

test("onLahdeTyyppiNosto tunnistaa media→paatos", () => {
  assert.equal(onLahdeTyyppiNosto("media", "paatos"), true);
  assert.equal(onLahdeTyyppiNosto("muu", "viranomaisasiakirja"), true);
  assert.equal(onLahdeTyyppiNosto("paatos", "media"), false);
  assert.equal(onLahdeTyyppiNosto("paatos", "viranomaisasiakirja"), false);
});

test("parsiLahdeTyyppiPaatokset vaatii valinnan", () => {
  const ristiriidat: LahdeTyyppiRistiriita[] = [
    {
      url: "https://example.com/a.pdf",
      dokumentti_id: "1",
      nykyinen_tyyppi: "media",
      json_tyyppi: "paatos",
      on_nosto: true,
    },
  ];
  const fd = new FormData();
  fd.set("lahde_tyyppi_ristiriita_url_0", "https://example.com/a.pdf");
  assert.throws(() => parsiLahdeTyyppiPaatokset(fd, ristiriidat), /Valitse/);
  fd.set("lahde_tyyppi_ristiriita_valinta_0", "json");
  const p = parsiLahdeTyyppiPaatokset(fd, ristiriidat);
  assert.equal(p[0]?.valinta, "json");
});

test("kaytettavatLahdeTyypit kunnioittaa päätöstä", () => {
  const tuonti = {
    nimi: "X",
    kunta: "Y",
    vaihe: "kaavoitus",
    kentat: [
      {
        kentta: "nimi",
        arvo: "X",
        lahteet: [
          {
            url: "https://example.com/a.pdf",
            lahde_tyyppi: "paatos",
            lainaus: "X",
          },
        ],
      },
    ],
  } as UusiHankeTuonti;
  const ristiriidat: LahdeTyyppiRistiriita[] = [
    {
      url: "https://example.com/a.pdf",
      dokumentti_id: "1",
      nykyinen_tyyppi: "media",
      json_tyyppi: "paatos",
      on_nosto: true,
    },
  ];
  const sailytetty = kaytettavatLahdeTyypit(tuonti, ristiriidat, [
    { url: "https://example.com/a.pdf", valinta: "nykyinen" },
  ]);
  assert.equal(sailytetty.get("https://example.com/a.pdf"), "media");
  const nostettu = kaytettavatLahdeTyypit(tuonti, ristiriidat, [
    { url: "https://example.com/a.pdf", valinta: "json" },
  ]);
  assert.equal(nostettu.get("https://example.com/a.pdf"), "paatos");
});
