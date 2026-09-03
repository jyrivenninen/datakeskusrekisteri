"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  LOMAKE_KENTAT,
  onPaivitettavaHankeKentta,
  onVaihtoehtoKentta,
  rakennaIlmoitusSisalto,
  rakennaSisalto,
  rakennaKuvaEhdotus,
  tarkistaUusiHanke,
  tarkistusKenttaLomakkeesta,
  type EhdotusSisalto,
  type IlmoitusKentanLahde,
} from "@/lib/ehdotus";
import { kasittelijaMerkinta } from "@/lib/naytto";
import { LUOTTAMUSTASOT, PALAUTE_AIHEET, type Luottamus } from "@/lib/supabase/tietokanta";
import { haeKirjautunutKayttaja, haeYllapitaja, luoPalvelinAsiakas } from "@/lib/supabase/palvelin";
import { hylkaaMuutosehdotus, hyvaksyMuutosehdotus, yhdistaHankkeetEhdotuksesta } from "@/lib/supabase/hyvaksynta";
import { luoYllapitoAsiakas, supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";
import { ESIVERSIO_EVASTE } from "@/lib/esiversio";

function ilmoitusPaluu(tyyppi: string, virhe: string): never {
  const q = new URLSearchParams({ virhe });
  if (tyyppi === "taydennys") q.set("tyyppi", "taydennys");
  redirect(`/ilmoitus?${q.toString()}`);
}

export async function lahetaIlmoitus(formData: FormData): Promise<void> {
  const tyyppi = String(formData.get("tyyppi") ?? "");
  const hankeIdRaaka = String(formData.get("hanke_id") ?? "").trim();
  const lahdeUrl = String(formData.get("lahde_url") ?? "");
  const lahdeSivu = String(formData.get("lahde_sivu") ?? "");
  const lainaus = String(formData.get("lainaus") ?? "");
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";

  const kentat: Record<string, string> = {};
  const kohdat: Record<string, IlmoitusKentanLahde> = {};
  for (const kentta of LOMAKE_KENTAT) {
    kentat[kentta] = String(formData.get(kentta) ?? "");
    kohdat[kentta] = {
      lahde_url: String(formData.get(`${kentta}_lahde_url`) ?? ""),
      lahde_sivu: String(formData.get(`${kentta}_lahde_sivu`) ?? ""),
      lainaus: String(formData.get(`${kentta}_lainaus`) ?? ""),
      luottamus: String(formData.get(`${kentta}_luottamus`) ?? ""),
    };
  }

  const { sisalto, virhe } = rakennaIlmoitusSisalto(
    kentat,
    lahdeUrl,
    lahdeSivu,
    lainaus,
    kohdat,
  );
  if (virhe) ilmoitusPaluu(tyyppi, virhe);

  if (tyyppi === "uusi_hanke") {
    const puute = tarkistaUusiHanke(sisalto);
    if (puute) ilmoitusPaluu(tyyppi, puute);
  } else if (tyyppi === "taydennys") {
    if (!hankeIdRaaka) {
      ilmoitusPaluu(tyyppi, "Valitse täydennettävä hanke.");
    }
    if (Object.keys(sisalto.kentat).length === 0) {
      ilmoitusPaluu(tyyppi, "Lisää vähintään yksi kenttä ja lähde.");
    }
  } else {
    ilmoitusPaluu(tyyppi, "Valitse ilmoituksen tyyppi.");
  }

  const ehdotuksenLahde =
    lahdeUrl.trim() || Object.values(sisalto.kentat)[0]?.lahde_url || null;
  const { user: yllapitaja, nimi: yllapitajaNimi } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const kasittelija = kasittelijaMerkinta(yllapitajaNimi, yllapitaja.email, yllapitaja.id);
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi,
        hanke_id: tyyppi === "taydennys" ? hankeIdRaaka : null,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
        sisalto,
        tila: "odottaa",
        huomautus: huomautus || null,
        lahde_url: ehdotuksenLahde,
      })
      .select("id")
      .single();
    if (error || !data) {
      ilmoitusPaluu(tyyppi, error?.message ?? "Tallennus epäonnistui.");
    }
    try {
      await hyvaksyMuutosehdotus(data.id, kasittelija);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Julkaisu epäonnistui.";
      ilmoitusPaluu(tyyppi, `${viesti} Ehdotus jäi tarkistusjonoon.`);
    }
    const { data: julkaistu } = await yllapito
      .from("muutosehdotukset")
      .select("hanke_id")
      .eq("id", data.id)
      .single();
    revalidatePath("/");
    revalidatePath("/yllapito");
    if (julkaistu?.hanke_id) {
      revalidatePath(`/hankkeet/${julkaistu.hanke_id}`);
      redirect(`/hankkeet/${julkaistu.hanke_id}`);
    }
    const valmis = new URLSearchParams({ valmis: "julkaistu" });
    if (tyyppi === "taydennys") valmis.set("tyyppi", "taydennys");
    redirect(`/ilmoitus?${valmis.toString()}`);
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
    lahde_url: ehdotuksenLahde,
  });

  if (error) {
    ilmoitusPaluu(tyyppi, error.message);
  }

  const valmis = new URLSearchParams({ valmis: "1" });
  if (tyyppi === "taydennys") valmis.set("tyyppi", "taydennys");
  redirect(`/ilmoitus?${valmis.toString()}`);
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
  const { user: yllapitaja, nimi: yllapitajaNimi } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const kasittelija = kasittelijaMerkinta(yllapitajaNimi, yllapitaja.email, yllapitaja.id);
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi,
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
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
      await hyvaksyMuutosehdotus(data.id, kasittelija);
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

export async function lahetaKenttaTarkistus(formData: FormData): Promise<void> {
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";
  const tarkistusKentta = tarkistusKenttaLomakkeesta(kentta);

  if (!hankeId) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent("Hanke puuttuu.")}`);
  }
  if (!tarkistusKentta) {
    paivitysPaluu(hankeId, kentta, "", "Kenttää ei voi merkitä ilman lähdettä.");
  }

  const sisalto: EhdotusSisalto = {
    kentat: {},
    tarkistus: {
      taulu: "hankkeet",
      rivi_id: hankeId,
      kentta: tarkistusKentta,
      tulos: "ei_julkista_lahdetta",
      huomautus: huomautus || null,
    },
  };

  const { user: yllapitaja, nimi: yllapitajaNimi } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const kasittelija = kasittelijaMerkinta(yllapitajaNimi, yllapitaja.email, yllapitaja.id);
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi: "kentta_tarkistus",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
        sisalto,
        tila: "odottaa",
        huomautus: huomautus || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      paivitysPaluu(hankeId, kentta, "", error?.message ?? "Tallennus epäonnistui.");
    }
    try {
      await hyvaksyMuutosehdotus(data.id, kasittelija);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Julkaisu epäonnistui.";
      paivitysPaluu(hankeId, kentta, "", `${viesti} Ehdotus jäi tarkistusjonoon.`);
    }
    revalidatePath("/");
    revalidatePath(`/hankkeet/${hankeId}`);
    revalidatePath("/yllapito");
    redirect(
      `/hankkeet/${hankeId}/paivita?kentta=${encodeURIComponent(kentta)}&valmis=julkaistu`,
    );
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("muutosehdotukset").insert({
    tyyppi: "kentta_tarkistus",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "lomake",
    ehdottaja_tunniste: tunniste,
    sisalto,
    tila: "odottaa",
    huomautus: huomautus || null,
  });
  if (error) paivitysPaluu(hankeId, kentta, "", error.message);
  redirect(
    `/hankkeet/${hankeId}/paivita?kentta=${encodeURIComponent(kentta)}&valmis=odottaa`,
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
  const { user: yllapitaja, nimi: yllapitajaNimi } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const kasittelija = kasittelijaMerkinta(yllapitajaNimi, yllapitaja.email, yllapitaja.id);
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi: "kuva",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
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
      await hyvaksyMuutosehdotus(data.id, kasittelija);
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
    .select("kayttaja_id, nimi, massahyvaksynta")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  return {
    user,
    massahyvaksynta: Boolean(data.massahyvaksynta),
    kasittelija: kasittelijaMerkinta(data.nimi, user.email, user.id),
  };
}

export async function hyvaksyEhdotusToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  const toiminto = String(formData.get("toiminto") ?? "kasittele");
  try {
    if (toiminto === "yhdista") {
      await yhdistaHankkeetEhdotuksesta(
        id,
        kasittelija,
        String(formData.get("sailytettava_hanke_id") ?? ""),
        String(formData.get("ei_uudelleen_perustelu") ?? ""),
      );
    } else {
      await hyvaksyMuutosehdotus(id, kasittelija, {
        perustelu: String(formData.get("ei_uudelleen_perustelu") ?? ""),
      });
    }
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
  const { kasittelija, massahyvaksynta } = await vaadiYllapitaja();
  if (!massahyvaksynta) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Massakäsittely vaatii erillisen oikeuden.")}`,
    );
  }
  if (String(formData.get("vahvista")) !== "kylla") {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Vahvista, että kaikki odottavat käsitellään.")}`,
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
    .select("id, tyyppi")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });
  if (error) {
    redirect(`/yllapito?virhe=${encodeURIComponent(error.message)}`);
  }

  let hyvaksytty = 0;
  let ohitettuRistiriita = 0;
  const epaonnistuneet: string[] = [];
  for (const rivi of odottavat ?? []) {
    if (rivi.tyyppi === "ristiriita_havainto") {
      ohitettuRistiriita += 1;
      continue;
    }
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
  const jonoon: string[] = [...epaonnistuneet];
  if (ohitettuRistiriita > 0) {
    jonoon.unshift(
      `${ohitettuRistiriita} ristiriitahavaintoa jäi jonoon: merkitse ne yksitellen ja kirjaa miksi eivät nouse uudelleen.`,
    );
  }
  if (jonoon.length > 0) {
    q.set("virhe", jonoon.slice(0, 5).join(" · "));
  }
  if (hyvaksytty === 0 && jonoon.length === 0) {
    q.set("virhe", "Ei odottavia ehdotuksia.");
  }
  redirect(`/yllapito?${q.toString()}`);
}

export async function hylkaaEhdotusToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  const perustelu = String(formData.get("perustelu") ?? "");
  try {
    await hylkaaMuutosehdotus(id, kasittelija, perustelu);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Hylkäys epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/yllapito");
  redirect("/yllapito?hylatty=1");
}

export async function kuittaaEsiversio(): Promise<void> {
  const evasteet = await cookies();
  evasteet.set(ESIVERSIO_EVASTE, "kylla", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    httpOnly: true,
  });
}

function palauteVirhe(viesti: string): never {
  redirect(`/yhteys?virhe=${encodeURIComponent(viesti)}`);
}

export async function lahetaPalaute(formData: FormData): Promise<void> {
  if (String(formData.get("organisaation_www") ?? "").trim()) {
    redirect("/yhteys?valmis=1");
  }

  const aiheRaaka = String(formData.get("aihe") ?? "palaute");
  const aihe = PALAUTE_AIHEET.includes(aiheRaaka as (typeof PALAUTE_AIHEET)[number])
    ? aiheRaaka
    : palauteVirhe("Valitse aihe.");
  const nimi = String(formData.get("nimi") ?? "").trim() || null;
  const sahkoposti = String(formData.get("sahkoposti") ?? "").trim() || null;
  const viesti = String(formData.get("viesti") ?? "").trim();

  if (viesti.length < 12) {
    palauteVirhe("Kirjoita viesti (vähintään 12 merkkiä).");
  }
  if (viesti.length > 8000) {
    palauteVirhe("Viesti on liian pitkä.");
  }
  if (nimi && nimi.length > 200) {
    palauteVirhe("Nimi on liian pitkä.");
  }
  if (sahkoposti && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sahkoposti)) {
    palauteVirhe("Tarkista sähköpostiosoite.");
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("palautteet").insert({
    aihe,
    nimi,
    sahkoposti,
    viesti,
    tila: "odottaa",
  });
  if (error) palauteVirhe(error.message);
  redirect("/yhteys?valmis=1");
}

export async function merkitsePalauteKasitellyksi(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  const huomautus = String(formData.get("huomautus") ?? "").trim() || null;
  const { supabase } = await haeKirjautunutKayttaja();
  const { error } = await supabase
    .from("palautteet")
    .update({
      tila: "kasitelty",
      kasitelty_pvm: new Date().toISOString(),
      kasittelija,
      huomautus,
    })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) {
    redirect(`/yllapito/palaute/${id}?virhe=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/yllapito");
  redirect("/yllapito?palaute=1");
}
