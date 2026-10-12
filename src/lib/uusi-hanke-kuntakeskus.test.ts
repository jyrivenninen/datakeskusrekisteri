import assert from "node:assert/strict";
import { test } from "node:test";
import { taydennaKuntakeskusArvio } from "./uusi-hanke-kuntakeskus";
import type { UusiHankeTuonti } from "./uusi-hanke-tuonti";

function pohjaIlmanKoordinaatteja(): UusiHankeTuonti {
  return {
    nimi: "Testikampus",
    kunta: "Kinnula",
    vaihe: "kaavoitus",
    kentat: [
      {
        kentta: "nimi",
        arvo: "Testikampus",
        lahteet: [
          {
            url: "https://example.com/x.pdf",
            lahde_tyyppi: "viranomaisasiakirja",
            lainaus: "Testikampus",
          },
        ],
      },
      {
        kentta: "kunta",
        arvo: "Kinnula",
        lahteet: [
          {
            url: "https://example.com/x.pdf",
            lahde_tyyppi: "viranomaisasiakirja",
            lainaus: "Kinnula",
          },
        ],
      },
      {
        kentta: "vaihe",
        arvo: "kaavoitus",
        lahteet: [
          {
            url: "https://example.com/x.pdf",
            lahde_tyyppi: "viranomaisasiakirja",
            lainaus: "Kaavoitus",
          },
        ],
      },
      {
        kentta: "sijainti_alue_tyyppi",
        arvo: "kaava_alue",
        lahteet: [
          {
            url: "https://example.com/x.pdf",
            lahde_tyyppi: "viranomaisasiakirja",
            lainaus: "Kaava-alue",
          },
        ],
      },
    ],
  };
}

function mockSupabase(kunta: {
  nimi: string;
  koodi: string;
  lahde_url: string | null;
  maakunta: string | null;
} | null) {
  return {
    from() {
      return {
        select() {
          return {
            ilike() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({ data: kunta, error: null }),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

test("ei täydennä kun lat ja lon ovat jo olemassa", async () => {
  const tuonti = pohjaIlmanKoordinaatteja();
  tuonti.kentat.push(
    {
      kentta: "sijainti_lat",
      arvo: "63.1",
      lahteet: [
        {
          url: "https://example.com/geo",
          lahde_tyyppi: "menetelma",
          lainaus: "Annettu",
        },
      ],
    },
    {
      kentta: "sijainti_lon",
      arvo: "25.2",
      lahteet: [
        {
          url: "https://example.com/geo",
          lahde_tyyppi: "menetelma",
          lainaus: "Annettu",
        },
      ],
    },
  );
  const t = await taydennaKuntakeskusArvio(
    tuonti,
    mockSupabase({
      nimi: "Kinnula",
      koodi: "256",
      lahde_url: null,
      maakunta: "Keski-Suomi",
    }),
    async () => {
      throw new Error("ei saa kutsua");
    },
  );
  assert.equal(t.taydennetty, false);
  assert.equal(t.tuonti.kentat.find((k) => k.kentta === "sijainti_lat")?.arvo, "63.1");
});

test("täydentää kuntakeskusarvion kun kuntakoodi täsmää", async () => {
  const tuonti = pohjaIlmanKoordinaatteja();
  const t = await taydennaKuntakeskusArvio(
    tuonti,
    mockSupabase({
      nimi: "Kinnula",
      koodi: "256",
      lahde_url: "https://www.ymparisto.fi/kinnula",
      maakunta: "Keski-Suomi",
    }),
    async () => ({
      lat: 63.3672712,
      lon: 24.9699576,
      lahde_url:
        "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search?text=Kinnula+kunta",
      label: "Kinnula",
      paikka_nimi: "Kinnula",
      kunta_nimi: "Kinnula",
      kunta_koodi: "256",
      maakunta_nimi: "Keski-Suomi",
      paikka_tyyppi: "Kunta",
    }),
  );
  assert.equal(t.taydennetty, true);
  assert.equal(t.sijainti.estaa_vahvistuksen, false);
  const lat = t.tuonti.kentat.find((k) => k.kentta === "sijainti_lat");
  assert.match(lat?.lahteet[0]?.lainaus ?? "", /256/);
  assert.match(lat?.lahteet[0]?.lainaus ?? "", /Kinnula/);
  assert.doesNotMatch(lat?.lahteet[0]?.lainaus ?? "", /Tuusula/);
});

test("ei kirjoita pistettä jos MML palauttaa väärän kunnan", async () => {
  const tuonti = pohjaIlmanKoordinaatteja();
  const t = await taydennaKuntakeskusArvio(
    tuonti,
    mockSupabase({
      nimi: "Kinnula",
      koodi: "256",
      lahde_url: null,
      maakunta: "Keski-Suomi",
    }),
    async () => ({
      lat: 60.3955238,
      lon: 25.060781,
      lahde_url: "https://example.com/mml",
      label: "Kinnula",
      paikka_nimi: "Kinnula",
      kunta_nimi: "Tuusula",
      kunta_koodi: "858",
      maakunta_nimi: "Uusimaa",
      paikka_tyyppi: "Talo",
    }),
  );
  assert.equal(t.taydennetty, false);
  assert.equal(
    t.tuonti.kentat.find((k) => k.kentta === "sijainti_lat"),
    undefined,
  );
  assert.equal(t.sijainti.estaa_vahvistuksen, false);
  assert.equal(t.sijainti.lat, null);
  assert.equal(t.sijainti.kunta_nimi, "Tuusula");
  assert.match(t.sijainti.varoitus ?? "", /luotettavasti/);
  assert.match(t.sijainti.varoitus ?? "", /Tuusula/);
  assert.match(t.sijainti.varoitus ?? "", /ilman pistettä/);
});
