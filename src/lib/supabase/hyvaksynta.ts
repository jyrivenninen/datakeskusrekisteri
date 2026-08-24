import {
  kentanLuottamus,
  kenttaArvoksi,
  VAIHTOEHTO_KENTAT,
  type EhdotettuKentta,
  type EhdotusSisalto,
} from "@/lib/ehdotus";
import { LAHDE_LAJIT, type LahdeLaji } from "@/lib/supabase/tietokanta";
import { luoYllapitoAsiakas } from "@/lib/supabase/yllapito-asiakas";

function tanaan(): string {
  return new Date().toISOString().slice(0, 10);
}

function lahdeLajiRiville(tieto: EhdotettuKentta): LahdeLaji {
  if (tieto.lahde_laji) {
    if (!(LAHDE_LAJIT as readonly string[]).includes(tieto.lahde_laji)) {
      throw new Error("lahde_laji ei ole sallittu.");
    }
    return tieto.lahde_laji;
  }
  return tieto.lahde_sivu == null ? "html" : "dokumentti";
}

function lahdeRivi(
  kentta: string,
  tieto: EhdotettuKentta,
  oletusLuottamus: "vahvistettu" | "epavarma" | "ristiriitainen",
) {
  return {
    kentta,
    lahde_url: tieto.lahde_url,
    lahde_sivu: tieto.lahde_sivu == null ? "" : String(tieto.lahde_sivu),
    lahde_laji: lahdeLajiRiville(tieto),
    vahvistettu_pvm: tanaan(),
    luottamus: kentanLuottamus(tieto, oletusLuottamus),
    lainaus: tieto.lainaus ?? "",
    merkitty: "ihmisen_vahvistama" as const,
  };
}

export async function hyvaksyMuutosehdotus(ehdotusId: string, kasittelija: string) {
  const supabase = luoYllapitoAsiakas();
  const { data: ehdotus, error } = await supabase
    .from("muutosehdotukset")
    .select("*")
    .eq("id", ehdotusId)
    .single();

  if (error || !ehdotus) {
    throw new Error("Ehdotusta ei löytynyt.");
  }
  if (ehdotus.tila !== "odottaa") {
    throw new Error("Ehdotus on jo käsitelty.");
  }

  if (ehdotus.tyyppi === "ytj_havainto") {
    const ytj = (ehdotus.sisalto as EhdotusSisalto).ytj;
    if (ytj?.ehdota_tunnus) {
      const { error: rpcVirhe } = await supabase.rpc("julkaise_organisaation_y_tunnus", {
        p_organisaatio_id: ytj.organisaatio_id,
        p_y_tunnus: ytj.y_tunnus,
        p_lahde_url: ehdotus.lahde_url,
        p_lainaus: ytj.ytj_nimi ?? ytj.rekisterin_nimi,
        p_ehdotus_id: ehdotusId,
        p_kasittelija: kasittelija,
      });
      if (rpcVirhe) throw new Error(rpcVirhe.message);
      return;
    }
  }

  if (
    ehdotus.tyyppi === "linkki_rikki" ||
    ehdotus.tyyppi === "ryhti_havainto" ||
    ehdotus.tyyppi === "kunta_havainto" ||
    ehdotus.tyyppi === "ytj_havainto" ||
    ehdotus.tyyppi === "mml_havainto"
  ) {
    const { error: paivitysVirhe } = await supabase
      .from("muutosehdotukset")
      .update({
        tila: "hyvaksytty",
        kasitelty_pvm: new Date().toISOString(),
        kasittelija,
      })
      .eq("id", ehdotusId)
      .eq("tila", "odottaa");
    if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    return;
  }

  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  const kentat = sisalto.kentat ?? {};
  const vaihtoehdot = sisalto.vaihtoehdot ?? {};
  const kuvat = sisalto.kuvat ?? [];

  if (kuvat.length > 0) {
    if (Object.keys(kentat).length > 0 || Object.keys(vaihtoehdot).length > 0) {
      throw new Error("Kuvaehdotusta ei voi yhdistää muihin kenttiin.");
    }
    if (!ehdotus.hanke_id) {
      throw new Error("Kuvaehdotukselta puuttuu hanke.");
    }
    const kuvaRivit = kuvat.map((kuva) => {
      const pohja: EhdotettuKentta = {
        arvo: kuva.kuva_url,
        lahde_url: kuva.lahde_url,
        lahde_sivu: kuva.lahde_sivu,
        lainaus: kuva.lainaus,
        luottamus: kuva.luottamus,
      };
      return {
        kuva_url: kuva.kuva_url,
        kuvateksti: kuva.kuvateksti,
        kuvaaja: kuva.kuvaaja,
        lahteet: [
          lahdeRivi("kuva_url", { ...pohja, arvo: kuva.kuva_url }, "vahvistettu"),
          lahdeRivi("kuvateksti", { ...pohja, arvo: kuva.kuvateksti }, "vahvistettu"),
          lahdeRivi("kuvaaja", { ...pohja, arvo: kuva.kuvaaja }, "vahvistettu"),
        ],
      };
    });
    const { error: kuvaVirhe } = await supabase.rpc("julkaise_hanke_kuvat", {
      p_hanke_id: ehdotus.hanke_id,
      p_kuvat: kuvaRivit,
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (kuvaVirhe) throw new Error(kuvaVirhe.message);
    return;
  }

  if (Object.keys(kentat).length === 0 && Object.keys(vaihtoehdot).length === 0) {
    throw new Error("Ehdotuksessa ei ole kenttiä.");
  }

  const SIJAINTI_KENTAT = new Set([
    "sijainti_lat",
    "sijainti_lon",
    "sijainti_alue_tyyppi",
  ]);

  const hanke: Record<string, string> = {};
  for (const [kentta, tieto] of Object.entries(kentat)) {
    if (kentta === "toimija_nimi") {
      hanke.toimija_nimi = tieto.arvo;
      continue;
    }
    const arvo = kenttaArvoksi(kentta, tieto.arvo);
    hanke[kentta] = arvo == null ? "" : String(arvo);
  }

  const lahteet = Object.entries(kentat)
    .filter(([kentta]) => !SIJAINTI_KENTAT.has(kentta))
    .map(([kentta, tieto]) =>
      lahdeRivi(
        kentta === "toimija_nimi" ? "toimija_organisaatio_id" : kentta,
        tieto,
        "vahvistettu",
      ),
    );
  const sijaintiLahde =
    kentat.sijainti_lat ?? kentat.sijainti_lon ?? kentat.sijainti_alue_tyyppi;
  if (sijaintiLahde) {
    lahteet.push(lahdeRivi("sijainti", sijaintiLahde, "epavarma"));
  }

  const sallitut = new Set<string>(VAIHTOEHTO_KENTAT);
  const vaihtoehtoRivit = Object.entries(vaihtoehdot).map(([tunnus, kentatVe]) => {
    const rivinKentat: Record<string, string> = {};
    const rivinLahteet = [];
    const ensimmainen = Object.values(kentatVe)[0];
    if (!ensimmainen) {
      throw new Error(`Vaihtoehdolta ${tunnus} puuttuvat kentät.`);
    }
    rivinLahteet.push(lahdeRivi("tunnus", ensimmainen, "epavarma"));
    for (const [kentta, tieto] of Object.entries(kentatVe)) {
      if (!sallitut.has(kentta)) {
        throw new Error(`Vaihtoehdon kenttä ei ole sallittu: ${kentta}`);
      }
      const arvo = kenttaArvoksi(kentta, tieto.arvo);
      rivinKentat[kentta] = arvo == null ? "" : String(arvo);
      rivinLahteet.push(lahdeRivi(kentta, tieto, "epavarma"));
    }
    return { tunnus, kentat: rivinKentat, lahteet: rivinLahteet };
  });

  const { error: rpcVirhe } = await supabase.rpc("julkaise_ehdotetut_tiedot", {
    p_tyyppi: ehdotus.tyyppi,
    p_hanke_id: ehdotus.hanke_id,
    p_hanke: hanke,
    p_lahteet: lahteet,
    p_ehdotus_id: ehdotusId,
    p_kasittelija: kasittelija,
    p_vaihtoehdot: vaihtoehtoRivit,
  });
  if (rpcVirhe) {
    throw new Error(rpcVirhe.message);
  }
}

export async function hylkaaMuutosehdotus(
  ehdotusId: string,
  kasittelija: string,
  perustelu: string,
) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase
    .from("muutosehdotukset")
    .update({
      tila: "hylatty",
      kasitelty_pvm: new Date().toISOString(),
      kasittelija,
      perustelu: perustelu.trim() || "Hylätty ylläpidossa.",
    })
    .eq("id", ehdotusId)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}