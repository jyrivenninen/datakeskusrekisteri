"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LOMAKE_KENTAT, rakennaSisalto, tarkistaUusiHanke } from "@/lib/ehdotus";
import { haeKirjautunutKayttaja, luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { hylkaaMuutosehdotus, hyvaksyMuutosehdotus } from "@/lib/supabase/hyvaksynta";

export async function lahetaIlmoitus(formData: FormData): Promise<void> {
  const tyyppi = String(formData.get("tyyppi") ?? "");
  const hankeIdRaaka = String(formData.get("hanke_id") ?? "").trim();
  const lahdeUrl = String(formData.get("lahde_url") ?? "");
  const lahdeSivu = String(formData.get("lahde_sivu") ?? "");
  const lainaus = String(formData.get("lainaus") ?? "");
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";

  const kentat: Record<string, string> = {};
  for (const kentta of LOMAKE_KENTAT) {
    kentat[kentta] = String(formData.get(kentta) ?? "");
  }

  const { sisalto, virhe } = rakennaSisalto(kentat, lahdeUrl, lahdeSivu, lainaus);
  if (virhe) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent(virhe)}`);
  }

  if (tyyppi === "uusi_hanke") {
    const puute = tarkistaUusiHanke(sisalto);
    if (puute) redirect(`/ilmoitus?virhe=${encodeURIComponent(puute)}`);
  } else if (tyyppi === "taydennys") {
    if (!hankeIdRaaka) {
      redirect(`/ilmoitus?virhe=${encodeURIComponent("Valitse täydennettävä hanke.")}`);
    }
    if (Object.keys(sisalto.kentat).length === 0) {
      redirect(`/ilmoitus?virhe=${encodeURIComponent("Lisää vähintään yksi kenttä ja lähde.")}`);
    }
  } else {
    redirect(`/ilmoitus?virhe=${encodeURIComponent("Valitse ilmoituksen tyyppi.")}`);
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("muutosehdotukset").insert({
    tyyppi,
    hanke_id: tyyppi === "taydennys" ? hankeIdRaaka : null,
    ehdottaja_tyyppi: "lomake",
    ehdottaja_tunniste: tunniste,
    sisalto,
    tila: "odottaa",
    huomautus: huomautus || null,
    lahde_url: lahdeUrl.trim(),
  });

  if (error) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent(error.message)}`);
  }

  redirect("/ilmoitus?valmis=1");
}

export async function kirjauduSisaan(formData: FormData): Promise<void> {
  const sahkoposti = String(formData.get("sahkoposti") ?? "");
  const salasana = String(formData.get("salasana") ?? "");
  const seuraava = String(formData.get("seuraava") ?? "/yllapito");
  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.auth.signInWithPassword({
    email: sahkoposti,
    password: salasana,
  });
  if (error) {
    redirect(`/kirjaudu?virhe=${encodeURIComponent("Kirjautuminen epäonnistui.")}`);
  }
  redirect(seuraava.startsWith("/") ? seuraava : "/yllapito");
}

export async function kirjauduUlos(): Promise<void> {
  const supabase = await luoPalvelinAsiakas();
  await supabase.auth.signOut();
  redirect("/");
}

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  return user;
}

export async function hyvaksyEhdotusToiminto(formData: FormData): Promise<void> {
  const user = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  try {
    await hyvaksyMuutosehdotus(id, user.email ?? user.id);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Hyväksyntä epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/");
  revalidatePath("/yllapito");
  redirect("/yllapito?hyvaksytty=1");
}

export async function hylkaaEhdotusToiminto(formData: FormData): Promise<void> {
  const user = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  const perustelu = String(formData.get("perustelu") ?? "");
  try {
    await hylkaaMuutosehdotus(id, user.email ?? user.id, perustelu);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Hylkäys epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/yllapito");
  redirect("/yllapito?hylatty=1");
}
