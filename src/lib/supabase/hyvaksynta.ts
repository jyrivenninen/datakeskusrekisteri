import {
  kentanLuottamus,
  kenttaArvoksi,
  VAIHTOEHTO_KENTAT,
  type EhdotettuKentta,
  type EhdotusSisalto,
} from "@/lib/ehdotus";
import { luoYllapitoAsiakas } from "@/lib/supabase/yllapito-asiakas";

function tanaan(): string {
  return new Date().toISOString().slice(0, 10);
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

  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  const kentat = sisalto.kentat ?? {};
  const vaihtoehdot = sisalto.vaihtoehdot ?? {};
  if (Object.keys(kentat).length === 0 && Object.keys(vaihtoehdot).length === 0) {
    throw new Error("Ehdotuksessa ei ole kenttiä.");
  }

  const hanke: Record<string, string> = {};
  for (const [kentta, tieto] of Object.entries(kentat)) {
    if (kentta === "toimija_nimi") {
      hanke.toimija_nimi = tieto.arvo;
      continue;
    }
    const arvo = kenttaArvoksi(kentta, tieto.arvo);
    hanke[kentta] = arvo == null ? "" : String(arvo);
  }

  const lahteet = Object.entries(kentat).map(([kentta, tieto]) =>
    lahdeRivi(
      kentta === "toimija_nimi" ? "toimija_organisaatio_id" : kentta,
      tieto,
      "vahvistettu",
    ),
  );

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