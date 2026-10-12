import assert from "node:assert/strict";
import { test } from "node:test";
import {
  onKelvotonLaatijaLahde,
  parsiJaValidoiUusiHankeTuonti,
  parsiSivuNumeroksi,
  tuontiEhdotusSisalloksi,
} from "./uusi-hanke-tuonti";

function pohja() {
  return {
    nimi: "Testikampus",
    kunta: "Testikunta",
    vaihe: "kaavoitus",
    kentat: [
      {
        kentta: "nimi",
        arvo: "Testikampus",
        lahteet: [
          {
            url: "https://example.com/paatos.pdf",
            lahde_tyyppi: "paatos",
            sivu: "3 (PDF)",
            lainaus: "Hankkeen nimi on Testikampus.",
          },
        ],
      },
      {
        kentta: "kunta",
        arvo: "Testikunta",
        lahteet: [
          {
            url: "https://example.com/paatos.pdf",
            lahde_tyyppi: "paatos",
            sivu: "1",
            lainaus: "Sijaintikunta Testikunta.",
          },
        ],
      },
      {
        kentta: "vaihe",
        arvo: "kaavoitus",
        lahteet: [
          {
            url: "https://example.com/paatos.pdf",
            lahde_tyyppi: "viranomaisasiakirja",
            sivu: "2",
            lainaus: "Asemakaavan muutos vireillä.",
          },
        ],
      },
      {
        kentta: "sijainti_alue_tyyppi",
        arvo: "arvio",
        lahteet: [
          {
            url: "https://example.com/paatos.pdf",
            lahde_tyyppi: "menetelma",
            lainaus: "Koordinaatit johdettu paikan nimestä.",
          },
        ],
      },
    ],
  };
}

test("parsiSivuNumeroksi lukee PDF-sivumerkinnän", () => {
  assert.equal(parsiSivuNumeroksi("3 (PDF)"), 3);
  assert.equal(parsiSivuNumeroksi(""), null);
});

test("logo ilman nimeä hylätään", () => {
  assert.match(
    onKelvotonLaatijaLahde("https://example.com/logo.png", "logo") ?? "",
    /Logo/,
  );
  assert.equal(
    onKelvotonLaatijaLahde(
      "https://example.com/about",
      "Ramboll Finland Oy laatii kaavan.",
    ),
    null,
  );
});

test("validi tuonti hyväksytään", () => {
  const t = parsiJaValidoiUusiHankeTuonti(pohja());
  assert.equal(t.ok, true, JSON.stringify(t.virheet));
  assert.equal(t.vainHeikotLahteet, false);
});

test("kenttä ilman lähdettä on virhe", () => {
  const raaka = pohja();
  raaka.kentat.push({
    kentta: "pinta_ala_ha",
    arvo: "40",
    lahteet: [],
  });
  const t = parsiJaValidoiUusiHankeTuonti(raaka);
  assert.equal(t.ok, false);
  assert.ok(t.virheet.some((v) => v.viesti.includes("ei ole lähdettä")));
});

test("teho ja it_teho samasta erottelemattomasta lähteestä hylätään", () => {
  const raaka = pohja();
  raaka.kentat.push(
    {
      kentta: "teho_mw",
      arvo: "100",
      lahteet: [
        {
          url: "https://example.com/uutinen",
          lahde_tyyppi: "media",
          lainaus: "Hankkeen teho on 100 MW.",
        },
      ],
    },
    {
      kentta: "it_teho_mw",
      arvo: "100",
      lahteet: [
        {
          url: "https://example.com/uutinen",
          lahde_tyyppi: "media",
          lainaus: "Hankkeen teho on 100 MW.",
        },
      ],
    },
  );
  const t = parsiJaValidoiUusiHankeTuonti(raaka);
  assert.equal(t.ok, false);
  assert.ok(t.virheet.some((v) => v.viesti.includes("teho_mw ja it_teho_mw")));
});

test("vain media-lähteet merkitään heikoiksi", () => {
  const raaka = pohja();
  for (const k of raaka.kentat) {
    for (const l of k.lahteet) l.lahde_tyyppi = "media";
  }
  const t = parsiJaValidoiUusiHankeTuonti(raaka);
  assert.equal(t.ok, true, JSON.stringify(t.virheet));
  assert.equal(t.vainHeikotLahteet, true);
});

test("henkilönimi roolissa hylätään", () => {
  const raaka = pohja();
  (raaka as unknown as { roolit: unknown[] }).roolit = [
    {
      rooli: "kaavan_laatija",
      organisaatio: "Matti Virtanen",
      lahde_url: "https://example.com/x",
      lainaus: "Laatija Matti Virtanen",
    },
  ];
  const t = parsiJaValidoiUusiHankeTuonti(raaka);
  assert.equal(t.ok, false);
  assert.ok(t.virheet.some((v) => v.viesti.includes("organisaatio")));
});

test("toimijalta vaaditaan lahde_tyyppi", () => {
  const raaka = {
    ...pohja(),
    toimija: {
      nimi: "Esimerkki Oy",
      lahde_url: "https://example.com/paatos.pdf",
      lainaus: "Esimerkki Oy on hankkeesta vastaava.",
    },
  };
  const t = parsiJaValidoiUusiHankeTuonti(raaka);
  assert.equal(t.ok, false);
  assert.ok(t.virheet.some((v) => v.polku === "toimija.lahde_tyyppi"));
});

test("useat lähteet per kenttä säilyvät ehdotuksessa", () => {
  const raaka = pohja();
  const teho = {
    kentta: "teho_mw",
    arvo: "250",
    lahteet: [
      {
        url: "https://example.com/oas.pdf",
        lahde_tyyppi: "viranomaisasiakirja",
        sivu: "5",
        lainaus: "OAS: teho noin 250 MW.",
      },
      {
        url: "https://example.com/sopimus.pdf",
        lahde_tyyppi: "viranomaisasiakirja",
        sivu: "2",
        lainaus: "Käynnistämissopimus: 250 MW.",
      },
    ],
  };
  raaka.kentat.push(teho);
  const t = parsiJaValidoiUusiHankeTuonti(raaka);
  assert.equal(t.ok, true, JSON.stringify(t.virheet));
  const sisalto = tuontiEhdotusSisalloksi(t.tuonti!);
  assert.equal(sisalto.kentat.teho_mw?.lahde_url, teho.lahteet[0]!.url);
  assert.equal(sisalto.kentat.teho_mw?.lisalahteet?.length, 1);
  assert.equal(
    sisalto.kentat.teho_mw?.lisalahteet?.[0]?.lahde_url,
    teho.lahteet[1]!.url,
  );
});
