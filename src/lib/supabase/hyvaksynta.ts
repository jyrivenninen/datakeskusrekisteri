import { kenttaArvoksi, type EhdotusSisalto } from "@/lib/ehdotus";
import { luoYllapitoAsiakas } from "@/lib/supabase/yllapito-asiakas";

function tanaan(): string {
  return new Date().toISOString().slice(0, 10);
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
  if (Object.keys(kentat).length === 0) {
    throw new Error("Ehdotuksessa ei ole kenttiä.");
  }

  let toimijaId: string | null = null;
  if (kentat.toimija_nimi?.arvo) {
    const { data: org, error: orgVirhe } = await supabase
      .from("organisaatiot")
      .insert({
        nimi: kentat.toimija_nimi.arvo,
        tyyppi: "yritys",
        julkaistu: true,
      })
      .select("id")
      .single();
    if (orgVirhe || !org) {
      throw new Error("Organisaatiota ei voitu lisätä.");
    }
    toimijaId = org.id;
  }

  const hanke: Record<string, string> = {};
  for (const [kentta, tieto] of Object.entries(kentat)) {
    if (kentta === "toimija_nimi") continue;
    const arvo = kenttaArvoksi(kentta, tieto.arvo);
    hanke[kentta] = arvo == null ? "" : String(arvo);
  }
  if (toimijaId) {
    hanke.toimija_organisaatio_id = toimijaId;
  }

  const lahteet = Object.entries(kentat).map(([kentta, tieto]) => ({
    kentta: kentta === "toimija_nimi" ? "toimija_organisaatio_id" : kentta,
    lahde_url: tieto.lahde_url,
    lahde_sivu: tieto.lahde_sivu == null ? "" : String(tieto.lahde_sivu),
    vahvistettu_pvm: tanaan(),
    luottamus: "vahvistettu",
    lainaus: tieto.lainaus ?? "",
    merkitty: "ihmisen_vahvistama",
  }));

  const { error: rpcVirhe } = await supabase.rpc("julkaise_ehdotetut_tiedot", {
    p_tyyppi: ehdotus.tyyppi,
    p_hanke_id: ehdotus.hanke_id,
    p_hanke: hanke,
    p_lahteet: lahteet,
    p_ehdotus_id: ehdotusId,
    p_kasittelija: kasittelija,
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
