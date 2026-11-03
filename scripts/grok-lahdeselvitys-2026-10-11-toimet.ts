/**
 * Grok lähdeselvitys 2026-10-11: osa B (uudet asiakirjat) ja tyhjät viranomais­haut → jonoon.
 * Raportit: Regant toimija, Moment kunta-lähde (kysely).
 *
 * Aja: npx tsx scripts/grok-lahdeselvitys-2026-10-11-toimet.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const EHDOTTAJA = "grok_lahdeselvitys_2026-10-11";
const HAKU_PVM = "2026-10-11";

type UusiAsiakirja = {
  hanke_id: string;
  url: string;
  otsikko: string;
  kunta_nimi: string;
  jarjestelma: string;
  julkaisija: string;
  julkaistu_pvm: string;
  lahde_tyyppi: "paatos";
  ilmenee: string;
};

const UUDET: UusiAsiakirja[] = [
  {
    hanke_id: "b29e82d3-2eab-4c8a-8c8f-b1eb2c46ea05",
    url: "https://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3511873",
    otsikko:
      "Teollisuustontin ja korttelialueen varaaminen Ruskonselästä korttelista 29, 564-84-29-2, Tehotie, Borealis Finland Oy, § 449, Dno OUKA/7367/10.00.02.02/2025",
    kunta_nimi: "Oulu",
    jarjestelma: "dynasty-tweb",
    julkaisija: "Oulun kaupunki, yhdyskuntalautakunta",
    julkaistu_pvm: "2025-10-28",
    lahde_tyyppi: "paatos",
    ilmenee: "laitoskoko 30-100 MW, tontti 30 362 m2 + noin 47 434 m2 lohkomaton alue, yhteensä noin 77 796 m2, varausaika 30.4.2026.",
  },
  {
    hanke_id: "b29e82d3-2eab-4c8a-8c8f-b1eb2c46ea05",
    url: "https://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3778791",
    otsikko:
      "Teollisuustontin ja korttelialueen varausajan jatkaminen Ruskonselässä korttelissa 29, 564-84-29-2, Tehotie, Borealis Finland Oy, § 370, Dno OUKA/7367/10.00.02.02/2025",
    kunta_nimi: "Oulu",
    jarjestelma: "dynasty-tweb",
    julkaisija: "Oulun kaupunki, yhdyskuntalautakunta",
    julkaistu_pvm: "2026-09-15",
    lahde_tyyppi: "paatos",
    ilmenee: "varausaika 31.1.2027, varausmaksu 8 001 euroa, ehto operaattorin vaihtumisesta.",
  },
  {
    hanke_id: "532bf1f0-c5cf-44b8-8365-1454839d361d",
    url: "https://salo10.oncloudos.com/kokous/2025815-11.PDF",
    otsikko:
      "Kärkän teollisuusalueen maa-alueen luovutuksen esisopimus, Kaupunginvaltuusto 19.5.2025 § 47",
    kunta_nimi: "Salo",
    jarjestelma: "oncloudos",
    julkaisija: "Salon kaupunki, kaupunginvaltuusto",
    julkaistu_pvm: "2025-05-19",
    lahde_tyyppi: "paatos",
    ilmenee: "Regant Oy, alue noin 7 ha, teollisuus- ja varastorakennusten korttelialue.",
  },
  {
    hanke_id: "532bf1f0-c5cf-44b8-8365-1454839d361d",
    url: "https://salo10.oncloudos.com/kokous/20261089-5.PDF",
    otsikko:
      "Esisopimuksen mukainen kauppa, määräalat kiinteistöistä 734-417-1-84, 734-432-4-0, 734-417-1-82 ja 734-16-9901-0, Kaupunginhallitus 10.08.2026 § 260, 4494/10.00.02.00/2026",
    kunta_nimi: "Salo",
    jarjestelma: "oncloudos",
    julkaisija: "Salon kaupunki, kaupunginhallitus",
    julkaistu_pvm: "2026-08-10",
    lahde_tyyppi: "paatos",
    ilmenee:
      "esisopimus siirretty 20.3.2026 hankeyhtiölle Regant DC1 Oy, tonttijakotontti 734-16-2-16, määräala 734-417-1-84 noin 60 230 m2.",
  },
];

type TyhjaHaku = {
  hanke_id: string;
  nimi: string;
  jarjestelma: string;
  lahde_url: string;
  kuvaus: string;
};

const TYHJAT_HAUT: TyhjaHaku[] = [
  {
    hanke_id: "a166f5ec-ff5d-4daa-9318-0224a5ff83f1",
    nimi: "DNA Oulu",
    jarjestelma: "Tweb asiakirjat.ouka.fi",
    lahde_url: "https://asiakirjat.ouka.fi/",
    kuvaus:
      "Haut: datakeskus, DNA, DNA Oyj, konesali, palvelinkeskus, datacenter, 2000–2026. Viranomaisasiakirjaa ei löytynyt.",
  },
  {
    hanke_id: "fd716a1f-7a41-45df-8363-7c8e89de4082",
    nimi: "GlobalConnect Espoo",
    jarjestelma: "Dynasty espoo.oncloudos.com",
    lahde_url: "https://espoo.oncloudos.com/",
    kuvaus:
      "Haut: GlobalConnect, Global Connect, datakeskus (56 osumaa), konesali, palvelinkeskus. Yksikään osuma ei koske GlobalConnectia.",
  },
  {
    hanke_id: "6ceb6771-450b-4d3f-832d-782ef53c6780",
    nimi: "Louhi Datacenter Espoo",
    jarjestelma: "Dynasty espoo.oncloudos.com",
    lahde_url: "https://espoo.oncloudos.com/",
    kuvaus:
      "Haut: Louhi (296 osumaa, 100 ensimmäistä otsikkoa läpikäyty), Louhi Datacenter, Louhi Net, datakeskus, konesali, palvelinkeskus. Ei hanketta koskevaa asiakirjaa.",
  },
  {
    hanke_id: "cbc424e0-af0f-4812-9ddc-e7396d076b65",
    nimi: "Moment Digital Klingendahl",
    jarjestelma: "Dynasty hanko10fi.oncloudos.com",
    lahde_url: "https://hanko10fi.oncloudos.com/",
    kuvaus:
      "Haut: Klingendahl (0), Moment Digital (0), datakeskus (2), konesali, datacenter. Ei osumia.",
  },
];

async function onkoJonossa(
  sb: ReturnType<typeof createClient>,
  lahdeUrl: string,
  hankeId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("muutosehdotukset")
    .select("id")
    .eq("tyyppi", "kunta_havainto")
    .eq("lahde_url", lahdeUrl)
    .eq("hanke_id", hankeId)
    .eq("tila", "odottaa")
    .limit(1);
  return Boolean(data?.length);
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let uudet = 0;
  let tyhjat = 0;

  for (const r of UUDET) {
    const { data: dok } = await sb.from("dokumentit").select("id").eq("url", r.url).maybeSingle();
    if (dok) continue;
    if (await onkoJonossa(sb, r.url, r.hanke_id)) continue;

    const huomautus = `Grok ${HAKU_PVM}: uusi viranomaisasiakirja (${r.lahde_tyyppi}). ${r.julkaisija}. Ilmenee: ${r.ilmenee}`;

    if (!kuiva) {
      const { error } = await sb.from("muutosehdotukset").insert({
        tyyppi: "kunta_havainto",
        hanke_id: r.hanke_id,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: EHDOTTAJA,
        lahde_url: r.url,
        huomautus,
        tila: "odottaa",
        sisalto: {
          kentat: {},
          kunta: {
            kunta_nimi: r.kunta_nimi,
            jarjestelma: r.jarjestelma,
            otsikko: r.otsikko,
            hakusana: EHDOTTAJA,
            grok_lahde_tyyppi: r.lahde_tyyppi,
            grok_julkaisija: r.julkaisija,
            grok_julkaistu_pvm: r.julkaistu_pvm,
            grok_ilmenee: r.ilmenee,
            dokumentit: [
              {
                url: r.url,
                otsikko: r.otsikko,
                laji: "muu",
                muoto: "pdf",
              },
            ],
          },
        },
      });
      if (error) throw new Error(error.message);
    }
    uudet += 1;
  }

  for (const h of TYHJAT_HAUT) {
    const lahdeUrl = h.lahde_url;
    const { data: aiempi } = await sb
      .from("muutosehdotukset")
      .select("id")
      .eq("tyyppi", "kunta_havainto")
      .eq("hanke_id", h.hanke_id)
      .eq("ehdottaja_tunniste", EHDOTTAJA)
      .eq("tila", "odottaa")
      .contains("sisalto", { kunta: { haku_tehty_pvm: HAKU_PVM } })
      .limit(1);
    if (aiempi?.length) continue;

    const huomautus = `Grok ${HAKU_PVM}: viranomaisasiakirjahaku suoritettu, ei osumia. ${h.jarjestelma}. ${h.kuvaus}`;

    if (!kuiva) {
      const { error } = await sb.from("muutosehdotukset").insert({
        tyyppi: "kunta_havainto",
        hanke_id: h.hanke_id,
        ehdottaja_tyyppi: "agentti",
        ehdottaja_tunniste: EHDOTTAJA,
        lahde_url: lahdeUrl,
        huomautus,
        tila: "odottaa",
        sisalto: {
          kentat: {},
          kunta: {
            kunta_nimi: h.nimi,
            jarjestelma: h.jarjestelma,
            otsikko: `Viranomaisasiakirjahaku ${HAKU_PVM}: ei osumia`,
            hakusana: EHDOTTAJA,
            haku_tehty_pvm: HAKU_PVM,
            haku_yhteenveto: h.kuvaus,
            dokumentit: [],
          },
        },
      });
      if (error) throw new Error(error.message);
    }
    tyhjat += 1;
  }

  console.log(JSON.stringify({ kuiva, ehdottaja: EHDOTTAJA, uudet_asiakirjat_jonoon: uudet, tyhjat_haut_jonoon: tyhjat }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
