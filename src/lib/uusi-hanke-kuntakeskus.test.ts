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

function mockSupabase(kunta: { nimi: string; lahde_url: string | null } | null) {
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
  const t = await taydennaKuntakeskusArvio(tuonti, mockSupabase(null), async () => {
    throw new Error("ei saa kutsua");
  });
  assert.equal(t.taydennetty, false);
  assert.equal(t.tuonti.kentat.find((k) => k.kentta === "sijainti_lat")?.arvo, "63.1");
});

test("täydentää kuntakeskusarvion ja merkitsee arvio + menetelma", async () => {
  const tuonti = pohjaIlmanKoordinaatteja();
  const t = await taydennaKuntakeskusArvio(
    tuonti,
    mockSupabase({
      nimi: "Kinnula",
      lahde_url: "https://www.ymparisto.fi/kinnula",
    }),
    async () => ({
      lat: 63.367,
      lon: 24.967,
      lahde_url: "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search?text=Kinnula",
      label: "Kinnula",
    }),
  );
  assert.equal(t.taydennetty, true);
  const lat = t.tuonti.kentat.find((k) => k.kentta === "sijainti_lat");
  const lon = t.tuonti.kentat.find((k) => k.kentta === "sijainti_lon");
  const tyyppi = t.tuonti.kentat.find((k) => k.kentta === "sijainti_alue_tyyppi");
  assert.equal(lat?.arvo, "63.367");
  assert.equal(lon?.arvo, "24.967");
  assert.equal(lat?.lahteet[0]?.lahde_tyyppi, "menetelma");
  assert.match(lat?.lahteet[0]?.lainaus ?? "", /Ei siirretty suunnan/);
  assert.equal(tyyppi?.arvo, "arvio");
});
