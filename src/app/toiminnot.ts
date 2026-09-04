"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  LOMAKE_KENTAT,
  onPaivitettavaHankeKentta,
  onVaihtoehtoKentta,
  rakennaIlmoitusSisalto,
  rakennaPaatosSisalto,
  rakennaSisalto,
  rakennaKuvaEhdotus,
  tarkistaUusiHanke,
  tarkistusKenttaLomakkeesta,
  tyhjennysKenttaLomakkeesta,
  type EhdotusSisalto,
  type IlmoitusKentanLahde,
} from "@/lib/ehdotus";
import { kasittelijaMerkinta, massaHyvaksyntaOhitettava } from "@/lib/naytto";
import { LUOTTAMUSTASOT, PALAUTE_AIHEET, type Luottamus } from "@/lib/supabase/tietokanta";
import { haeKirjautunutKayttaja, haeYllapitaja, luoPalvelinAsiakas, vaadiYllapitaja as vaadiYllapitajaSivu } from "@/lib/supabase/palvelin";
import { hylkaaMuutosehdotus, hyvaksyMuutosehdotus, julkaiseHanke, kuitaaHankeKentat, paivitaKenttaLahdeUrl, paivitaKuittausLuottamus, piilotaHankeKuva, yhdistaHankkeetEhdotuksesta } from "@/lib/supabase/hyvaksynta";
import { haeKuittausNakyma } from "@/lib/supabase/kuittaus-kysely";
import { onKuittausTaydennys, ryhmitteleKuittausKentat } from "@/lib/kuittaus";
import {
  onKuittausSuodatusAktiivinen,
  parsiKuittausSuodatus,
  suodataKuittausRivit,
} from "@/lib/kuittaus-suodatus";
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

export async function lahetaKenttaTyhjennys(formData: FormData): Promise<void> {
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const perustelu = String(formData.get("perustelu") ?? "").trim();
  const lahdeUrl = String(formData.get("lahde_url") ?? "").trim();
  const merkitse = String(formData.get("merkitse_ei_lahdetta") ?? "") === "kylla";
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";

  if (!hankeId) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent("Hanke puuttuu.")}`);
  }
  const tyhjennysKentta = tyhjennysKenttaLomakkeesta(kentta);
  if (!tyhjennysKentta) {
    paivitysPaluu(hankeId, kentta, "", "Kenttää ei voi tyhjentää.");
  }
  if (perustelu.length < 12) {
    paivitysPaluu(hankeId, kentta, "", "Perustelu vaaditaan (vähintään 12 merkkiä).");
  }

  const sisalto: EhdotusSisalto = {
    kentat: {},
    tyhjennys: {
      taulu: "hankkeet",
      rivi_id: hankeId,
      kentta: tyhjennysKentta,
      perustelu,
      lahde_url: lahdeUrl || null,
      merkitse_ei_lahdetta: merkitse,
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
        tyyppi: "kentta_tyhjennys",
        hanke_id: hankeId,
        ehdottaja_tyyppi: "yllapitaja",
        ehdottaja_tunniste: kasittelija,
        sisalto,
        tila: "odottaa",
        lahde_url: lahdeUrl || null,
        huomautus: perustelu,
      })
      .select("id")
      .single();
    if (error || !data) {
      paivitysPaluu(hankeId, kentta, "", error?.message ?? "Tallennus epäonnistui.");
    }
    try {
      await hyvaksyMuutosehdotus(data.id, kasittelija);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Tyhjennys epäonnistui.";
      paivitysPaluu(hankeId, kentta, "", `${viesti} Ehdotus jäi jonoon.`);
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
    tyyppi: "kentta_tyhjennys",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "lomake",
    ehdottaja_tunniste: tunniste,
    sisalto,
    tila: "odottaa",
    lahde_url: lahdeUrl || null,
    huomautus: perustelu,
  });
  if (error) paivitysPaluu(hankeId, kentta, "", error.message);
  redirect(
    `/hankkeet/${hankeId}/paivita?kentta=${encodeURIComponent(kentta)}&valmis=odottaa`,
  );
}

function paatosPaluu(hankeId: string, virhe: string): never {
  redirect(`/hankkeet/${hankeId}/paatos?virhe=${encodeURIComponent(virhe)}`);
}

export async function lahetaPaatos(formData: FormData): Promise<void> {
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kuvaus = String(formData.get("kuvaus") ?? "");
  const pvm = String(formData.get("pvm") ?? "");
  const organisaatioNimi = String(formData.get("paattava_organisaatio_nimi") ?? "");
  const lahdeUrl = String(formData.get("lahde_url") ?? "");
  const lahdeSivu = String(formData.get("lahde_sivu") ?? "");
  const lainaus = String(formData.get("lainaus") ?? "");
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  const tunniste = String(formData.get("ehdottaja_tunniste") ?? "").trim() || "ilmoituslomake";
  const luottamusRaaka = String(formData.get("luottamus") ?? "").trim();

  if (!hankeId) {
    redirect(`/ilmoitus?virhe=${encodeURIComponent("Hanke puuttuu.")}`);
  }

  const luottamus: Luottamus = (LUOTTAMUSTASOT as readonly string[]).includes(luottamusRaaka)
    ? (luottamusRaaka as Luottamus)
    : "vahvistettu";

  const { paatos, virhe } = rakennaPaatosSisalto(
    kuvaus,
    pvm,
    organisaatioNimi,
    lahdeUrl,
    lahdeSivu,
    lainaus,
    luottamus,
  );
  if (virhe) paatosPaluu(hankeId, virhe);

  const sisalto: EhdotusSisalto = { kentat: {}, paatos };
  const { user: yllapitaja, nimi: yllapitajaNimi } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());

  if (julkaiseSuoraan && yllapitaja) {
    const kasittelija = kasittelijaMerkinta(yllapitajaNimi, yllapitaja.email, yllapitaja.id);
    const yllapito = luoYllapitoAsiakas();
    const { data, error } = await yllapito
      .from("muutosehdotukset")
      .insert({
        tyyppi: "paatos",
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
      paatosPaluu(hankeId, error?.message ?? "Tallennus epäonnistui.");
    }
    try {
      await hyvaksyMuutosehdotus(data.id, kasittelija);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Julkaisu epäonnistui.";
      paatosPaluu(hankeId, `${viesti} Ehdotus jäi tarkistusjonoon.`);
    }
    revalidatePath("/");
    revalidatePath(`/hankkeet/${hankeId}`);
    revalidatePath("/yllapito");
    redirect(`/hankkeet/${hankeId}/paatos?valmis=julkaistu`);
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("muutosehdotukset").insert({
    tyyppi: "paatos",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "lomake",
    ehdottaja_tunniste: tunniste,
    sisalto,
    tila: "odottaa",
    huomautus: huomautus || null,
    lahde_url: lahdeUrl.trim(),
  });
  if (error) paatosPaluu(hankeId, error.message);
  redirect(`/hankkeet/${hankeId}/paatos?valmis=odottaa`);
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

export async function poistaKuvaToiminto(formData: FormData): Promise<void> {
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kuvaId = String(formData.get("kuva_id") ?? "").trim();
  const paluu = hankeId ? `/hankkeet/${hankeId}` : "/";

  if (!hankeId || !kuvaId) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Kuva tai hanke puuttuu.")}`);
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `${paluu}?virhe=${encodeURIComponent("Kuvan poisto vaatii palvelinavaimen.")}`,
    );
  }

  const { user, nimi } = await vaadiYllapitajaSivu(paluu);
  const kasittelija = kasittelijaMerkinta(nimi, user.email ?? "", user.id);
  try {
    await piilotaHankeKuva(kuvaId, kasittelija);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Kuvan poisto epäonnistui.";
    redirect(`${paluu}?virhe=${encodeURIComponent(viesti)}`);
  }

  revalidatePath("/");
  revalidatePath(`/hankkeet/${hankeId}`);
  revalidatePath("/yllapito");
  redirect(`${paluu}?kuva_poistettu=1`);
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

export async function julkaiseHankeToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const paluu = String(formData.get("paluu") ?? "/yllapito").trim() || "/yllapito";
  if (!hankeId) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Hanke puuttuu.")}`);
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `${paluu}?virhe=${encodeURIComponent("Julkaisu vaatii palvelinavaimen.")}`,
    );
  }
  try {
    await julkaiseHanke(hankeId, kasittelija);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Julkaisu epäonnistui.";
    redirect(`${paluu}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/");
  revalidatePath("/yllapito");
  revalidatePath("/hakemisto");
  revalidatePath(`/hankkeet/${hankeId}`);
  const erotin = paluu.includes("?") ? "&" : "?";
  redirect(`${paluu}${erotin}julkaistu=1`);
}

export async function korjaaLinkkiLahdeToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "").trim();
  const uusiUrl = String(formData.get("uusi_lahde_url") ?? "").trim();
  if (!id || !uusiUrl) {
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent("Anna uusi lähde-URL.")}`);
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `/yllapito/${id}?virhe=${encodeURIComponent("Korjaus vaatii palvelinavaimen.")}`,
    );
  }

  const yllapito = luoYllapitoAsiakas();
  const { data: ehdotus, error } = await yllapito
    .from("muutosehdotukset")
    .select("id, tyyppi, tila, sisalto, hanke_id")
    .eq("id", id)
    .single();
  if (error || !ehdotus) {
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent("Ehdotusta ei löytynyt.")}`);
  }
  if (ehdotus.tyyppi !== "linkki_rikki") {
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent("Toiminto on vain linkkihavainnoille.")}`);
  }
  if (ehdotus.tila !== "odottaa") {
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent("Ehdotus on jo käsitelty.")}`);
  }

  const linkki = (ehdotus.sisalto as EhdotusSisalto).linkki;
  if (!linkki?.url || !linkki.rivi_id || !linkki.kentta || !linkki.taulu) {
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent("Linkkihavainnon tiedot puuttuvat.")}`);
  }
  if (linkki.taulu !== "hankkeet" && linkki.taulu !== "dokumentit") {
    redirect(
      `/yllapito/${id}?virhe=${encodeURIComponent("Tätä lähdetyyppiä ei voi korjata tästä.")}`,
    );
  }

  try {
    if (linkki.taulu === "hankkeet") {
      await paivitaKenttaLahdeUrl(
        linkki.taulu,
        linkki.rivi_id,
        linkki.kentta,
        linkki.url,
        uusiUrl,
      );
    } else {
      const { data, error: dokVirhe } = await yllapito
        .from("dokumentit")
        .update({ url: uusiUrl })
        .eq("id", linkki.rivi_id)
        .eq("url", linkki.url)
        .select("id");
      if (dokVirhe) throw new Error(dokVirhe.message);
      if (!data?.length) throw new Error("Dokumentin URL:ää ei löytynyt päivitettäväksi.");
    }
    await hyvaksyMuutosehdotus(id, kasittelija);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Korjaus epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }

  revalidatePath("/");
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  const hankeId =
    ehdotus.hanke_id ?? (linkki.taulu === "hankkeet" ? linkki.rivi_id : null);
  if (hankeId) {
    revalidatePath(`/hankkeet/${hankeId}`);
  }
  redirect(`/yllapito?hyvaksytty=1`);
}

export async function kuitaaKentatToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Kuittaus vaatii palvelinavaimen.")}`,
    );
  }
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kentatRaaka = String(formData.get("kentat") ?? "").trim();
  const kentat = kentatRaaka.split(",").map((k) => k.trim()).filter(Boolean);
  if (!hankeId || kentat.length === 0) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Valitse vähintään yksi kenttä kuittattavaksi.")}`,
    );
  }
  try {
    const lkm = await kuitaaHankeKentat(hankeId, kentat, kasittelija);
    if (lkm === 0) {
      redirect(
        `/yllapito?virhe=${encodeURIComponent("Kentillä ei ollut koneen ehdottamaa lähdettä.")}`,
      );
    }
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Kuittaus epäonnistui.";
    redirect(`/yllapito?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/");
  revalidatePath("/yllapito");
  revalidatePath(`/hankkeet/${hankeId}`);
  revalidatePath("/hankkeet", "layout");
  redirect("/yllapito?kuitattu=1");
}

export async function kuitaaKaikkiTaydennyksetToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (String(formData.get("vahvista")) !== "kylla") {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Vahvista täydennysten kuittaus.")}`,
    );
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Kuittaus vaatii palvelinavaimen.")}`,
    );
  }

  const tulos = await haeKuittausNakyma();
  const taydennykset = (tulos?.rivit ?? []).filter(onKuittausTaydennys);
  if (taydennykset.length === 0) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Ei kuittattavia täydennyksiä.")}`,
    );
  }

  const hankeittain = ryhmitteleKuittausKentat(taydennykset);
  let kuitattu = 0;
  const epaonnistuneet: string[] = [];

  for (const [hankeId, kentat] of hankeittain) {
    try {
      kuitattu += await kuitaaHankeKentat(hankeId, kentat, kasittelija);
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Kuittaus epäonnistui.";
      epaonnistuneet.push(`${hankeId}: ${viesti}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  for (const hankeId of hankeittain.keys()) {
    revalidatePath(`/hankkeet/${hankeId}`);
  }

  if (kuitattu === 0) {
    const viesti =
      epaonnistuneet.length > 0
        ? epaonnistuneet.slice(0, 3).join(" · ")
        : "Yhtään kenttää ei kuittattu.";
    redirect(`/yllapito?virhe=${encodeURIComponent(viesti)}`);
  }

  if (epaonnistuneet.length > 0) {
    redirect(
      `/yllapito?kuitattu=${kuitattu}&virhe=${encodeURIComponent(
        `${kuitattu} kuittattu, ${epaonnistuneet.length} epäonnistui.`,
      )}`,
    );
  }

  redirect(`/yllapito?kuitattu=${kuitattu}`);
}

type KuittausMuutosRivi = {
  avain: string;
  hanke_id: string;
  lahde_kentta: string;
  kuitaa: boolean;
  luottamus: Luottamus;
};

function kuittausPaluuPolku(params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  const qs = q.toString();
  return qs ? `/yllapito/kuittaus?${qs}` : "/yllapito/kuittaus";
}

export async function kuitaaValitutToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const suodatus = parsiKuittausSuodatus({
    q: String(formData.get("q") ?? ""),
    kunta: String(formData.get("kunta") ?? ""),
    toimija: String(formData.get("toimija") ?? ""),
    vaihe: String(formData.get("vaihe") ?? ""),
    kentta: String(formData.get("kentta") ?? ""),
    taydennys: String(formData.get("taydennys") ?? ""),
    ennen: String(formData.get("ennen") ?? ""),
  });

  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      kuittausPaluuPolku({
        virhe: "Kuittaus vaatii palvelinavaimen.",
      }),
    );
  }

  let muutokset: KuittausMuutosRivi[];
  try {
    muutokset = JSON.parse(String(formData.get("muutokset") ?? "[]")) as KuittausMuutosRivi[];
  } catch {
    redirect(
      kuittausPaluuPolku({
        virhe: "Muutostiedot olivat virheelliset.",
      }),
    );
  }

  if (muutokset.length === 0) {
    redirect(
      kuittausPaluuPolku({
        virhe: "Ei tallennettavia muutoksia.",
      }),
    );
  }

  const tulos = await haeKuittausNakyma();
  const kaikkiRivit = tulos?.rivit ?? [];
  const riviAvaimella = new Map(kaikkiRivit.map((r) => [r.avain, r]));
  const suodatetut = suodataKuittausRivit(kaikkiRivit, suodatus);
  const sallitutAvaimet = new Set(suodatetut.map((r) => r.avain));

  const kuitattavia = muutokset.filter((m) => m.kuitaa);
  if (kuitattavia.length > 0 && !onKuittausSuodatusAktiivinen(suodatus)) {
    redirect(
      kuittausPaluuPolku({
        virhe: "Kuittaus vaatii vähintään yhden suodattimen.",
      }),
    );
  }

  let kuitattu = 0;
  let paivitetty = 0;
  const hankeIdt = new Set<string>();
  const epaonnistuneet: string[] = [];

  for (const muutos of muutokset) {
    const rivi = riviAvaimella.get(muutos.avain);
    if (!rivi) {
      epaonnistuneet.push(`${muutos.avain}: riviä ei löydy`);
      continue;
    }
    if (muutos.hanke_id !== rivi.hanke_id || muutos.lahde_kentta !== rivi.lahde_kentta) {
      epaonnistuneet.push(`${muutos.avain}: tunniste ei täsmää`);
      continue;
    }
    if (!(LUOTTAMUSTASOT as readonly string[]).includes(muutos.luottamus)) {
      epaonnistuneet.push(`${muutos.avain}: luottamus ei ole sallittu`);
      continue;
    }

    try {
      if (muutos.kuitaa) {
        if (!sallitutAvaimet.has(muutos.avain)) {
          epaonnistuneet.push(`${muutos.avain}: ei suodatetussa joukossa`);
          continue;
        }
        if (muutos.luottamus === "ristiriitainen") {
          epaonnistuneet.push(`${muutos.avain}: kuittauksessa ei voi olla ristiriitainen`);
          continue;
        }
        const lkm = await kuitaaHankeKentat(
          muutos.hanke_id,
          [muutos.lahde_kentta],
          kasittelija,
          muutos.luottamus,
        );
        if (lkm > 0) {
          kuitattu += lkm;
          hankeIdt.add(muutos.hanke_id);
        }
      } else if (muutos.luottamus !== rivi.luottamus) {
        const lkm = await paivitaKuittausLuottamus(
          muutos.hanke_id,
          muutos.lahde_kentta,
          muutos.luottamus,
        );
        if (lkm > 0) {
          paivitetty += lkm;
          hankeIdt.add(muutos.hanke_id);
        }
      }
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Tallennus epäonnistui.";
      epaonnistuneet.push(`${muutos.avain}: ${viesti}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/yllapito");
  revalidatePath("/yllapito/kuittaus");
  revalidatePath("/hankkeet", "layout");
  for (const hankeId of hankeIdt) {
    revalidatePath(`/hankkeet/${hankeId}`);
  }

  const paluu: Record<string, string> = {};
  if (kuitattu > 0) paluu.kuitattu = String(kuitattu);
  if (paivitetty > 0) paluu.paivitetty = String(paivitetty);
  if (epaonnistuneet.length > 0) {
    paluu.virhe = epaonnistuneet.slice(0, 3).join(" · ");
  }
  if (kuitattu === 0 && paivitetty === 0 && epaonnistuneet.length === 0) {
    paluu.virhe = "Yhtään muutosta ei tallennettu.";
  }

  redirect(kuittausPaluuPolku(paluu));
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
  let ohitettu = 0;
  const epaonnistuneet: string[] = [];
  for (const rivi of odottavat ?? []) {
    if (massaHyvaksyntaOhitettava(rivi.tyyppi)) {
      ohitettu += 1;
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
  if (ohitettu > 0) {
    jonoon.unshift(
      `${ohitettu} riviä jäi jonoon (ristiriitahavainto, kenttämuutos tai päätös): käsittele yksitellen.`,
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
