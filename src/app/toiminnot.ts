"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  LOMAKE_KENTAT,
  onPaivitettavaHankeKentta,
  onVaihtoehtoKentta,
  rakennaSisalto,
  rakennaKuvaEhdotus,
  tarkistaUusiHanke,
  type EhdotusSisalto,
} from "@/lib/ehdotus";
import { LUOTTAMUSTASOT, type Luottamus } from "@/lib/supabase/tietokanta";
import { haeKirjautunutKayttaja, haeYllapitaja, luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { hylkaaMuutosehdotus, hyvaksyMuutosehdotus } from "@/lib/supabase/hyvaksynta";
import { luoYllapitoAsiakas, supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";

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

function paivitysPaluu(
  hankeId: string,
  kentta: string,
  vaihtoehto: string,
  virhe: string,
): never {
  const q = new URLSearchParams({ kentta, virhe });
  if (vaihtoehto) q.set("vaihtoehto", vaihtoehto);
  redirect(`/hankkeet/${hankeId}/paivita?${q.toString()}`);
}

export async function lahetaKenttapaivitys(formData: FormData): Promise<void> {
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const vaihtoehto = String(formData.get("vaihtoehto") ?? "").trim();
  const arvo = String(formData.get("arvo") ?? "");
  const lahdeUrl = String(formData.get("lahde_url") ?? "");
  const lahdeSivu = String(formData.get("lahde_sivu") ?? "");
  const lainaus = String(formData.get("lainaus") ?? "");
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";
  const nykyinen = String(formData.get("nykyinen_arvo") ?? "").trim();
  const luottamusRaaka = String(formData.get("luottamus") ?? "").trim();

  if (!hankeId) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent("Hanke puuttuu.")}`);
  }
  if (vaihtoehto) {
    if (!onVaihtoehtoKentta(kentta)) {
      paivitysPaluu(hankeId, kentta, vaihtoehto, "Vaihtoehdon kenttä ei ole sallittu.");
    }
  } else if (!onPaivitettavaHankeKentta(kentta)) {
    paivitysPaluu(hankeId, kentta, vaihtoehto, "Kenttä ei ole päivitettävissä tällä lomakkeella.");
  }

  const { sisalto: pohja, virhe } = rakennaSisalto(
    { [kentta]: arvo },
    lahdeUrl,
    lahdeSivu,
    lainaus,
  );
  if (virhe) paivitysPaluu(hankeId, kentta, vaihtoehto, virhe);
  if (Object.keys(pohja.kentat).length === 0) {
    paivitysPaluu(hankeId, kentta, vaihtoehto, "Anna kentän arvo ja lähde.");
  }

  const luottamus: Luottamus | undefined = (LUOTTAMUSTASOT as readonly string[]).includes(
    luottamusRaaka,
  )
    ? (luottamusRaaka as Luottamus)
    : undefined;
  if (luottamus) {
    for (const tieto of Object.values(pohja.kentat)) {
      tieto.luottamus = luottamus;
    }
  }

  const sisalto: EhdotusSisalto = vaihtoehto
    ? { kentat: {}, vaihtoehdot: { [vaihtoehto]: pohja.kentat } }
    : pohja;

  const tyyppi = nykyinen ? "korjaus" : "taydennys";
  const { user: yllapitaja } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi,
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: yllapitaja.email ?? yllapitaja.id,
        sisalto,
        tila: "odottaa",
        huomautus: huomautus || null,
        lahde_url: lahdeUrl.trim(),
      })
      .select("id")
      .single();
    if (error || !data) {
      paivitysPaluu(hankeId, kentta, vaihtoehto, error?.message ?? "Tallennus epäonnistui.");
    }
    try {
      await hyvaksyMuutosehdotus(data.id, yllapitaja.email ?? yllapitaja.id);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Julkaisu epäonnistui.";
      paivitysPaluu(
        hankeId,
        kentta,
        vaihtoehto,
        `${viesti} Ehdotus jäi tarkistusjonoon.`,
      );
    }
    revalidatePath("/");
    revalidatePath(`/hankkeet/${hankeId}`);
    revalidatePath("/yllapito");
    redirect(`/hankkeet/${hankeId}/paivita?kentta=${encodeURIComponent(kentta)}${vaihtoehto ? `&vaihtoehto=${encodeURIComponent(vaihtoehto)}` : ""}&valmis=julkaistu`);
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("muutosehdotukset").insert({
    tyyppi,
    hanke_id: hankeId,
    ehdottaja_tyyppi: "lomake",
    ehdottaja_tunniste: tunniste,
    sisalto,
    tila: "odottaa",
    huomautus: huomautus || null,
    lahde_url: lahdeUrl.trim(),
  });
  if (error) {
    paivitysPaluu(hankeId, kentta, vaihtoehto, error.message);
  }
  redirect(
    `/hankkeet/${hankeId}/paivita?kentta=${encodeURIComponent(kentta)}${vaihtoehto ? `&vaihtoehto=${encodeURIComponent(vaihtoehto)}` : ""}&valmis=odottaa`,
  );
}

function kuvaPaluu(hankeId: string, virhe: string): never {
  redirect(`/hankkeet/${hankeId}/kuva?virhe=${encodeURIComponent(virhe)}`);
}

export async function lahetaKuva(formData: FormData): Promise<void> {
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kuvaUrl = String(formData.get("kuva_url") ?? "");
  const kuvateksti = String(formData.get("kuvateksti") ?? "");
  const kuvaaja = String(formData.get("kuvaaja") ?? "");
  const lahdeUrl = String(formData.get("lahde_url") ?? "");
  const lahdeSivu = String(formData.get("lahde_sivu") ?? "");
  const lainaus = String(formData.get("lainaus") ?? "");
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";
  const luottamusRaaka = String(formData.get("luottamus") ?? "").trim();

  if (!hankeId) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent("Hanke puuttuu.")}`);
  }

  const { kuva, virhe } = rakennaKuvaEhdotus(
    kuvaUrl,
    kuvateksti,
    kuvaaja,
    lahdeUrl,
    lahdeSivu,
    lainaus,
  );
  if (virhe) kuvaPaluu(hankeId, virhe);

  const luottamus: Luottamus | undefined = (LUOTTAMUSTASOT as readonly string[]).includes(
    luottamusRaaka,
  )
    ? (luottamusRaaka as Luottamus)
    : undefined;
  if (luottamus) kuva.luottamus = luottamus;

  const sisalto: EhdotusSisalto = { kentat: {}, kuvat: [kuva] };
  const { user: yllapitaja } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi: "kuva",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: yllapitaja.email ?? yllapitaja.id,
        sisalto,
        tila: "odottaa",
        huomautus: huomautus || null,
        lahde_url: kuva.lahde_url,
      })
      .select("id")
      .single();
    if (error || !data) {
      kuvaPaluu(hankeId, error?.message ?? "Tallennus epäonnistui.");
    }
    try {
      await hyvaksyMuutosehdotus(data.id, yllapitaja.email ?? yllapitaja.id);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Julkaisu epäonnistui.";
      kuvaPaluu(hankeId, `${viesti} Ehdotus jäi tarkistusjonoon.`);
    }
    revalidatePath("/");
    revalidatePath(`/hankkeet/${hankeId}`);
    revalidatePath("/yllapito");
    redirect(`/hankkeet/${hankeId}/kuva?valmis=julkaistu`);
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("muutosehdotukset").insert({
    tyyppi: "kuva",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "lomake",
    ehdottaja_tunniste: tunniste,
    sisalto,
    tila: "odottaa",
    huomautus: huomautus || null,
    lahde_url: kuva.lahde_url,
  });
  if (error) kuvaPaluu(hankeId, error.message);
  redirect(`/hankkeet/${hankeId}/kuva?valmis=odottaa`);
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
  revalidatePath("/hankkeet", "layout");
  redirect("/yllapito?hyvaksytty=1");
}

export async function hyvaksyKaikkiOdottavatToiminto(formData: FormData): Promise<void> {
  const user = await vaadiYllapitaja();
  if (String(formData.get("vahvista")) !== "kylla") {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Vahvista, että kaikki odottavat julkaistaan.")}`,
    );
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Hyväksyntä vaatii palvelinavaimen.")}`,
    );
  }

  const { supabase } = await haeKirjautunutKayttaja();
  const { data: odottavat, error } = await supabase
    .from("muutosehdotukset")
    .select("id")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });
  if (error) {
    redirect(`/yllapito?virhe=${encodeURIComponent(error.message)}`);
  }

  const kasittelija = user.email ?? user.id;
  let hyvaksytty = 0;
  const epaonnistuneet: string[] = [];
  for (const rivi of odottavat ?? []) {
    try {
      await hyvaksyMuutosehdotus(rivi.id, kasittelija);
      hyvaksytty += 1;
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Hyväksyntä epäonnistui.";
      epaonnistuneet.push(`${rivi.id.slice(0, 8)}: ${viesti}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");

  const q = new URLSearchParams();
  if (hyvaksytty > 0) q.set("hyvaksytty", String(hyvaksytty));
  if (epaonnistuneet.length > 0) {
    q.set(
      "virhe",
      `${epaonnistuneet.length} ehdotusta jäi jonoon. ${epaonnistuneet.slice(0, 5).join(" · ")}`,
    );
  }
  if (hyvaksytty === 0 && epaonnistuneet.length === 0) {
    q.set("virhe", "Ei odottavia ehdotuksia.");
  }
  redirect(`/yllapito?${q.toString()}`);
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
