"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidateJulkinenSisalto } from "@/lib/julkinen-revalidointi";
import {
  LOMAKE_KENTAT,
  parsiIlmoitusLisalahteet,
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
import {
  ehdotusPoistetulleHankkeelle,
  itTehoYlittaaTehon,
  kasittelijaMerkinta,
  lueMegawatti,
  massaHyvaksyntaOhitettava,
  massaHyvaksyntaOhitettavaSisalto,
} from "@/lib/naytto";
import {
  haeSeuraavaOdottavaHavaintoId,
  haeTurvallinenSeuraavaHavaintoPolku,
  kuuluuHavaintojonoon,
} from "@/lib/seuraava-ehdotus";
import { LUOTTAMUSTASOT, PALAUTE_AIHEET, type Luottamus } from "@/lib/supabase/tietokanta";
import { haeKirjautunutKayttaja, haeYllapitaja, luoPalvelinAsiakas, vaadiYllapitaja as vaadiYllapitajaSivu } from "@/lib/supabase/palvelin";
import { hylkaaMuutosehdotus, hyvaksyMuutosehdotus, julkaiseDokumenttiLahdeMetatiedot, julkaiseHanke, kuitaaHankeKentat, merkitseHankeDuplikaatiksi, paivitaKenttaLahdeUrl, paivitaKuittausLuottamus, piilotaHankeKuva, yhdistaHankkeetEhdotuksesta } from "@/lib/supabase/hyvaksynta";
import {
  LS13_RATKAISU_IDT,
  type Ls13RatkaisuId,
} from "@/lib/lahdeselvitys13-ratkaisut";
import {
  ehdotuksellaKerrosalaPintaAlaksi,
  ehdotuksellaPintaAlaYksikkoEpaselva,
  epaselvatPintaAlaKentat,
  muunnaM2Ha,
} from "@/lib/pinta-ala-yksikko";
import {
  parsiTuontiJsonTekstista,
  taydennaTyhjaIlmoituksenId,
} from "@/lib/uusi-hanke-tuonti";
import { taydennaKuntakeskusArvio } from "@/lib/uusi-hanke-kuntakeskus";
import { haeUusiHankeTuplat } from "@/lib/uusi-hanke-tuplat";
import { kirjoitaUusiHankeTuonti } from "@/lib/uusi-hanke-kirjoitus";
import {
  haeYllapitoLuonnos,
  poistaYllapitoLuonnos,
  tallennaYllapitoLuonnos,
  UUSI_HANKE_ESIKATSELU_AVAIN,
} from "@/lib/yllapito-luonnos";
import {
  haeLahdeTyyppiRistiriidat,
  parsiLahdeTyyppiPaatokset,
} from "@/lib/uusi-hanke-lahde-tyyppi-ristiriita";
import { LAHDE_TYYPIT, SITOVUUSTASOT } from "@/lib/lahde-metatiedot";
import { haeKuittausNakyma } from "@/lib/supabase/kuittaus-kysely";
import { onKuittausTaydennys, ryhmitteleKuittausKentat } from "@/lib/kuittaus";
import {
  onKuittausSuodatusAktiivinen,
  parsiKuittausSuodatus,
  suodataKuittausRivit,
} from "@/lib/kuittaus-suodatus";
import { haeHankkeetYllapitoon, luoYllapitoAsiakas, poistetutHankeIdt, supabasePalvelinAvainAsetettu } from "@/lib/supabase/yllapito-asiakas";
import {
  ESIVERSIO_EVASTE,
  ESIVERSIO_EVASTE_ARVO,
  ESIVERSIO_EVASTE_MAX_AGE_S,
} from "@/lib/esiversio";
import { lahdeUrlKieltoViesti } from "@/lib/lahde-url-kielto";

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

  const lisalahteet = parsiIlmoitusLisalahteet(
    formData.getAll("lisalahde_kentta").map((arvo) => String(arvo)),
    formData.getAll("lisalahde_url").map((arvo) => String(arvo)),
    formData.getAll("lisalahde_viesti").map((arvo) => String(arvo)),
  );
  if (lisalahteet.virhe) ilmoitusPaluu(tyyppi, lisalahteet.virhe);
  if (lisalahteet.lisalahteet.length > 0) {
    sisalto.lisalahteet = lisalahteet.lisalahteet;
  }

  if (tyyppi === "uusi_hanke") {
    const puute = tarkistaUusiHanke(sisalto);
    if (puute) ilmoitusPaluu(tyyppi, puute);
  } else if (tyyppi === "taydennys") {
    if (!hankeIdRaaka) {
      ilmoitusPaluu(tyyppi, "Valitse täydennettävä hanke.");
    }
    if (Object.keys(sisalto.kentat).length === 0 && !sisalto.lisalahteet?.length) {
      ilmoitusPaluu(tyyppi, "Valitse tieto ja anna osoite.");
    }
  } else {
    ilmoitusPaluu(tyyppi, "Valitse ilmoituksen tyyppi.");
  }

  const ehdotuksenLahde =
    lahdeUrl.trim() ||
    Object.values(sisalto.kentat)[0]?.lahde_url ||
    sisalto.lisalahteet?.[0]?.url ||
    null;
  if (ehdotuksenLahde) {
    const kielto = lahdeUrlKieltoViesti(ehdotuksenLahde);
    if (kielto) ilmoitusPaluu(tyyppi, kielto);
  }
  const { user: yllapitaja, nimi: yllapitajaNimi } = await haeYllapitaja();
  const julkaiseSuoraan = Boolean(yllapitaja && supabasePalvelinAvainAsetettu());
  if (!julkaiseSuoraan) {
    for (const tieto of Object.values(sisalto.kentat)) {
      tieto.luottamus = "epavarma";
    }
  }

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
    revalidateJulkinenSisalto({ hankeId: julkaistu?.hanke_id });
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

async function tehoSuhdeVirhe(
  hankeId: string,
  kentta: string,
  arvo: string,
  vaihtoehto: string,
): Promise<string | null> {
  const uusi = lueMegawatti(arvo);
  if (uusi == null) return null;
  const supabase = await luoPalvelinAsiakas();
  const kysely = vaihtoehto
    ? supabase
        .from("hanke_vaihtoehdot")
        .select("teho_mw, it_teho_mw")
        .eq("hanke_id", hankeId)
        .eq("tunnus", vaihtoehto)
        .maybeSingle()
    : supabase.from("hankkeet").select("teho_mw, it_teho_mw").eq("id", hankeId).maybeSingle();
  const { data } = await kysely;
  const nykyinenIt = data?.it_teho_mw != null ? Number(data.it_teho_mw) : null;
  const nykyinenTeho = data?.teho_mw != null ? Number(data.teho_mw) : null;
  const itTeho = kentta === "it_teho_mw" ? uusi : nykyinenIt;
  const teho = kentta === "teho_mw" ? uusi : nykyinenTeho;
  if (!itTehoYlittaaTehon(itTeho, teho)) return null;
  return "IT-teho ei voi olla suurempi kuin laitoksen teho. Jos lähde antaa vain yhden erittelemättömän megawattiluvun, merkitse se vain toiseen kenttään.";
}

export async function lahetaKenttapaivitys(formData: FormData): Promise<void> {
  const kommentti = String(formData.get("kommentti") ?? "").trim();
  if (String(formData.get("toiminto") ?? "") === "tyhjennys") {
    if (!String(formData.get("perustelu") ?? "").trim()) {
      formData.set("perustelu", kommentti);
    }
    return lahetaKenttaTyhjennys(formData);
  }

  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const vaihtoehto = String(formData.get("vaihtoehto") ?? "").trim();
  const arvo = String(formData.get("arvo") ?? "");
  const lahdeUrl = String(formData.get("lahde_url") ?? "");
  const lahdeSivu = String(formData.get("lahde_sivu") ?? "");
  const lainaus = String(formData.get("lainaus") ?? "");
  const huomautus = kommentti || String(formData.get("huomautus") ?? "").trim();
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

  const yksikko = String(formData.get("yksikko") ?? "").trim();
  const lomakeKentat: Record<string, string> = { [kentta]: arvo };
  if (kentta === "polttoainevarasto_maara") {
    if (!["m3", "litra", "mw"].includes(yksikko)) {
      paivitysPaluu(hankeId, kentta, vaihtoehto, "Polttoainevaraston yksikkö puuttuu.");
    }
    lomakeKentat.polttoainevarasto_yksikko = yksikko;
  }
  if (kentta === "diesel_vuosikulutus_maara") {
    if (!["litra", "m3"].includes(yksikko)) {
      paivitysPaluu(hankeId, kentta, vaihtoehto, "Dieselin vuosikulutuksen yksikkö puuttuu.");
    }
    lomakeKentat.diesel_vuosikulutus_yksikko = yksikko;
  }
  if (kentta === "varavoima_paastot_t_co2e" && lainaus.trim() === "") {
    paivitysPaluu(
      hankeId,
      kentta,
      vaihtoehto,
      "Varavoiman päästöluku vaatii lainauksen, josta ilmenee kuka luvun on laskenut.",
    );
  }
  if (
    (kentta === "sijaintiperustelu" || kentta === "muut_sijainnit") &&
    lainaus.trim() === ""
  ) {
    paivitysPaluu(
      hankeId,
      kentta,
      vaihtoehto,
      "Sijaintiperustelu ja muiden sijaintien tarkastelu vaativat lainauksen lähteestä.",
    );
  }
  if (
    kentta === "muut_sijainnit" &&
    !["tarkasteltu_ja_nimetty", "tarkasteltu_nimeamatta", "ei_kasitelty"].includes(
      arvo.trim(),
    )
  ) {
    paivitysPaluu(hankeId, kentta, vaihtoehto, "Muiden sijaintien arvo ei ole sallittu.");
  }
  const { sisalto: pohja, virhe } = rakennaSisalto(
    lomakeKentat,
    lahdeUrl,
    lahdeSivu,
    lainaus,
  );
  if (virhe) paivitysPaluu(hankeId, kentta, vaihtoehto, virhe);
  if (Object.keys(pohja.kentat).length === 0) {
    paivitysPaluu(hankeId, kentta, vaihtoehto, "Anna kentän arvo ja lähde.");
  }

  if (kentta === "teho_mw" || kentta === "it_teho_mw") {
    const suhdeVirhe = await tehoSuhdeVirhe(hankeId, kentta, arvo, vaihtoehto);
    if (suhdeVirhe) paivitysPaluu(hankeId, kentta, vaihtoehto, suhdeVirhe);
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
    revalidateJulkinenSisalto({ hankeId: hankeId });
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
    revalidateJulkinenSisalto({ hankeId: hankeId });
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
  const perustelu = (
    String(formData.get("perustelu") ?? "").trim() ||
    String(formData.get("kommentti") ?? "").trim()
  );
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
    paivitysPaluu(
      hankeId,
      kentta,
      "",
      "Kommentti vaaditaan, kun arvoa ehdotetaan tyhjennettäväksi (vähintään 12 merkkiä).",
    );
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
    revalidateJulkinenSisalto({ hankeId: hankeId });
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
    revalidateJulkinenSisalto({ hankeId: hankeId });
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
    revalidateJulkinenSisalto({ hankeId: hankeId });
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
  revalidateJulkinenSisalto({ hankeId: hankeId });
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
    supabase,
    massahyvaksynta: Boolean(data.massahyvaksynta),
    kasittelija: kasittelijaMerkinta(data.nimi, user.email, user.id),
  };
}

async function redirectHavaintojononJalkeen(
  supabase: Awaited<ReturnType<typeof vaadiYllapitaja>>["supabase"],
  seuraavaId: string | null,
  viestiAvain: "hyvaksytty" | "hylatty" | "kasitelty",
): Promise<never> {
  const polku = await haeTurvallinenSeuraavaHavaintoPolku(supabase, seuraavaId, viestiAvain);
  if (polku) {
    redirect(polku);
  }
  redirect(`/yllapito?${viestiAvain}=1&jono_loppui=1`);
}

export async function hyvaksyEhdotusToiminto(formData: FormData): Promise<void> {
  const { kasittelija, supabase } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  const toiminto = String(formData.get("toiminto") ?? "kasittele");
  const seuraavaJonoon =
    String(formData.get("seuraava_jonoon") ?? "1").trim() !== "0";
  let kasiteltavaTyyppi: string | null = null;
  let seuraavaId: string | null = null;
  if (seuraavaJonoon) {
    const { data: nykyinen } = await supabase
      .from("muutosehdotukset")
      .select("tyyppi")
      .eq("id", id)
      .maybeSingle();
    kasiteltavaTyyppi = nykyinen?.tyyppi ?? null;
    if (kasiteltavaTyyppi && kuuluuHavaintojonoon(kasiteltavaTyyppi)) {
      seuraavaId = await haeSeuraavaOdottavaHavaintoId(supabase, id);
    }
  }
  try {
    if (toiminto === "yhdista") {
      await yhdistaHankkeetEhdotuksesta(
        id,
        kasittelija,
        String(formData.get("sailytettava_hanke_id") ?? ""),
        String(formData.get("ei_uudelleen_perustelu") ?? ""),
        String(formData.get("yhdistys_lahde_url") ?? ""),
        String(formData.get("yhdistys_vahvistus_tyyppi") ?? ""),
      );
    } else {
      const tulos = await hyvaksyMuutosehdotus(id, kasittelija, {
        perustelu: String(formData.get("ei_uudelleen_perustelu") ?? ""),
        hanke_id: String(formData.get("kunta_hanke_id") ?? "").trim() || undefined,
        dokumentit_url: formData
          .getAll("kunta_dokumentti_url")
          .map((arvo) => String(arvo).trim())
          .filter(Boolean),
      });
      if (tulos === "odottaa_kohdistusta") {
        revalidatePath("/yllapito");
        revalidatePath(`/yllapito/${id}`);
        redirect(
          `/yllapito/${id}?virhe=${encodeURIComponent(
            "Kohdistus epävarma: valitse oikea hanke ennen julkaisua. Rivi siirrettiin kohdistusjonoon.",
          )}`,
        );
      }
    }
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Hyväksyntä epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/");
  revalidateJulkinenSisalto();
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  revalidatePath(`/yllapito/${id}`);
  if (
    seuraavaJonoon &&
    kasiteltavaTyyppi &&
    kuuluuHavaintojonoon(kasiteltavaTyyppi)
  ) {
    return redirectHavaintojononJalkeen(supabase, seuraavaId, "hyvaksytty");
  }
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
  revalidateJulkinenSisalto({ hankeId: hankeId });
  revalidatePath("/yllapito");
  revalidatePath("/hakemisto");
  revalidatePath(`/hankkeet/${hankeId}`);
  const erotin = paluu.includes("?") ? "&" : "?";
  redirect(`${paluu}${erotin}julkaistu=1`);
}

export async function merkitseHankeDuplikaatiksiToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  const duplikaattiId = String(formData.get("duplikaatti_id") ?? "").trim();
  const kohdeId = String(formData.get("kohde_id") ?? "").trim();
  const perustelu = String(formData.get("perustelu") ?? "").trim();
  const lahdeUrl = String(formData.get("yhdistys_lahde_url") ?? "").trim();
  const vahvistusTyyppi = String(formData.get("yhdistys_vahvistus_tyyppi") ?? "").trim();
  const paluu = String(formData.get("paluu") ?? "/yllapito").trim() || "/yllapito";
  if (!duplikaattiId || !kohdeId) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Duplikaatti ja kohde vaaditaan.")}`);
  }
  if (perustelu.length < 12) {
    redirect(
      `${paluu}?virhe=${encodeURIComponent("Perustele duplikaatti vähintään 12 merkillä.")}`,
    );
  }
  if (!lahdeUrl) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Duplikaatti vaatii lähde-URL:n.")}`);
  }
  if (
    !["sama_kaavatunnus", "sama_yva", "asiakirja_molemmat", "jatkumo_asiakirja"].includes(
      vahvistusTyyppi,
    )
  ) {
    redirect(
      `${paluu}?virhe=${encodeURIComponent("Valitse yhdistyksen vahvistustyyppi.")}`,
    );
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `${paluu}?virhe=${encodeURIComponent("Toiminto vaatii palvelinavaimen.")}`,
    );
  }
  try {
    await merkitseHankeDuplikaatiksi(
      duplikaattiId,
      kohdeId,
      kasittelija,
      perustelu,
      lahdeUrl,
      vahvistusTyyppi,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Duplikaatin merkintä epäonnistui.";
    redirect(`${paluu}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/");
  revalidateJulkinenSisalto({ hankeId: duplikaattiId });
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  revalidatePath(`/hankkeet/${duplikaattiId}`);
  const erotin = paluu.includes("?") ? "&" : "?";
  redirect(`${paluu}${erotin}poistettu=1`);
}

export async function korjaaLinkkiLahdeToiminto(formData: FormData): Promise<void> {
  const { kasittelija, supabase } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "").trim();
  const uusiUrl = String(formData.get("uusi_lahde_url") ?? "").trim();
  const seuraavaId = await haeSeuraavaOdottavaHavaintoId(supabase, id);
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

  const hankeId =
    ehdotus.hanke_id ?? (linkki.taulu === "hankkeet" ? linkki.rivi_id : null);
  revalidatePath("/");
  revalidateJulkinenSisalto({ hankeId });
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  if (hankeId) {
    revalidatePath(`/hankkeet/${hankeId}`);
  }
  revalidatePath(`/yllapito/${id}`);
  return redirectHavaintojononJalkeen(supabase, seuraavaId, "hyvaksytty");
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
  revalidateJulkinenSisalto({ hankeId: hankeId });
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
  revalidateJulkinenSisalto();
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
  revalidateJulkinenSisalto();
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
    .select("id, tyyppi, hanke_id, sisalto")
    .eq("tila", "odottaa")
    .order("luotu_pvm", { ascending: true });
  if (error) {
    redirect(`/yllapito?virhe=${encodeURIComponent(error.message)}`);
  }

  const hankeIdt = [
    ...new Set(
      (odottavat ?? [])
        .map((rivi) => rivi.hanke_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const hankkeet = await haeHankkeetYllapitoon(hankeIdt);
  const duplikaattiHankeIdt = poistetutHankeIdt(hankkeet);

  let hyvaksytty = 0;
  let ohitettu = 0;
  const epaonnistuneet: string[] = [];
  for (const rivi of odottavat ?? []) {
    if (
      massaHyvaksyntaOhitettava(rivi.tyyppi) ||
      massaHyvaksyntaOhitettavaSisalto(
        rivi.sisalto as {
          huomio?: string;
          vaatii_lukeminen?: boolean;
          rakentamisvaiheet?: unknown[];
          vaihtoehdot?: Record<string, unknown>;
          asiakirjat?: unknown[];
        } | null,
      )
    ) {
      ohitettu += 1;
      continue;
    }
    if (ehdotusPoistetulleHankkeelle(rivi.hanke_id, duplikaattiHankeIdt)) {
      ohitettu += 1;
      continue;
    }
    try {
      const tulos = await hyvaksyMuutosehdotus(rivi.id, kasittelija);
      if (tulos === "odottaa_kohdistusta") {
        ohitettu += 1;
        continue;
      }
      hyvaksytty += 1;
    } catch (syy) {
      const viesti = syy instanceof Error ? syy.message : "Hyväksyntä epäonnistui.";
      epaonnistuneet.push(`${rivi.id.slice(0, 8)}: ${viesti}`);
    }
  }

  revalidatePath("/");
  revalidateJulkinenSisalto();
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");

  const q = new URLSearchParams();
  if (hyvaksytty > 0) q.set("hyvaksytty", String(hyvaksytty));
  const jonoon: string[] = [...epaonnistuneet];
  if (ohitettu > 0) {
    jonoon.unshift(
      `${ohitettu} riviä jäi jonoon (ristiriitahavainto, epävarma kohdistus, kenttämuutos, päätös, tehon kenttävalinta, rakentamisvaihe, YVA-vaihtoehto, asiakirja tai poistettu hanke): käsittele yksitellen.`,
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
  const { kasittelija, supabase } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "");
  const perustelu = String(formData.get("perustelu") ?? "");
  const seuraavaJonoon =
    String(formData.get("seuraava_jonoon") ?? "1").trim() !== "0";
  let kasiteltavaTyyppi: string | null = null;
  let seuraavaId: string | null = null;
  if (seuraavaJonoon) {
    const { data: nykyinen } = await supabase
      .from("muutosehdotukset")
      .select("tyyppi")
      .eq("id", id)
      .maybeSingle();
    kasiteltavaTyyppi = nykyinen?.tyyppi ?? null;
    if (kasiteltavaTyyppi && kuuluuHavaintojonoon(kasiteltavaTyyppi)) {
      seuraavaId = await haeSeuraavaOdottavaHavaintoId(supabase, id);
    }
  }
  try {
    await hylkaaMuutosehdotus(id, kasittelija, perustelu);
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Hylkäys epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }
  revalidatePath("/yllapito");
  revalidatePath(`/yllapito/${id}`);
  if (
    seuraavaJonoon &&
    kasiteltavaTyyppi &&
    kuuluuHavaintojonoon(kasiteltavaTyyppi)
  ) {
    return redirectHavaintojononJalkeen(supabase, seuraavaId, "hylatty");
  }
  redirect("/yllapito?hylatty=1");
}

/** Vahvistaa pinta-/kaava-alan yksikön (> raja) ennen julkaisua. */
export async function vahvistaPintaAlaYksikkoToiminto(
  formData: FormData,
): Promise<void> {
  const { supabase } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "").trim();
  const yksikko = String(formData.get("yksikko") ?? "").trim();
  if (!id) throw new Error("Ehdotus puuttuu.");
  if (yksikko !== "ha" && yksikko !== "m2") {
    throw new Error("Valitse yksikkö ha tai m².");
  }

  const { data: ehdotus, error } = await supabase
    .from("muutosehdotukset")
    .select("id, sisalto, tila")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ehdotus || ehdotus.tila !== "odottaa") {
    throw new Error("Ehdotusta ei löytynyt tai se on jo käsitelty.");
  }

  const sisalto = (ehdotus.sisalto ?? {}) as EhdotusSisalto;
  const epaselvat = epaselvatPintaAlaKentat(sisalto.kentat);
  if (epaselvat.length === 0) {
    throw new Error("Ei epäselvää pinta-alakenttää.");
  }

  const uudetKentat = { ...sisalto.kentat };
  for (const { kentta, arvo } of epaselvat) {
    const vanha = uudetKentat[kentta];
    if (!vanha) continue;
    if (yksikko === "m2") {
      uudetKentat[kentta] = {
        ...vanha,
        arvo: String(muunnaM2Ha(arvo)),
        yksikko: "ha",
        lainaus: vanha.lainaus
          ? `${vanha.lainaus} [yksikkö vahvistettu: ${arvo} m² → ${muunnaM2Ha(arvo)} ha]`
          : `Yksikkö vahvistettu: ${arvo} m² → ${muunnaM2Ha(arvo)} ha`,
      };
    } else {
      uudetKentat[kentta] = {
        ...vanha,
        yksikko: "ha",
        lainaus: vanha.lainaus
          ? `${vanha.lainaus} [yksikkö vahvistettu: ha]`
          : "Yksikkö vahvistettu: ha",
      };
    }
  }

  const { error: paivitysVirhe } = await supabase
    .from("muutosehdotukset")
    .update({ sisalto: { ...sisalto, kentat: uudetKentat } })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (paivitysVirhe) throw new Error(paivitysVirhe.message);

  revalidatePath(`/yllapito/${id}`);
  revalidatePath("/yllapito");
  redirect(`/yllapito/${id}`);
}

/** Lähdeselvitys 13 -poikkeaman ratkaisu (radiovalinta läpikäynnissä). */
export async function kasitteleLahdeselvitys13RatkaisuToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija, supabase } = await vaadiYllapitaja();
  const id = String(formData.get("id") ?? "").trim();
  const ratkaisuRaaka = String(formData.get("ls13_ratkaisu") ?? "").trim();
  const perustelu = String(formData.get("perustelu") ?? "").trim();
  const seuraavaJonoon =
    String(formData.get("seuraava_jonoon") ?? "1").trim() !== "0";

  if (!id) {
    redirect(`/yllapito?virhe=${encodeURIComponent("Ehdotus puuttuu.")}`);
  }
  if (
    !(LS13_RATKAISU_IDT as readonly string[]).includes(ratkaisuRaaka)
  ) {
    redirect(
      `/yllapito/${id}?virhe=${encodeURIComponent("Valitse ratkaisuvaihtoehto.")}`,
    );
  }
  const ratkaisu = ratkaisuRaaka as Ls13RatkaisuId;

  let kasiteltavaTyyppi: string | null = null;
  let seuraavaId: string | null = null;
  if (seuraavaJonoon) {
    const { data: nykyinen } = await supabase
      .from("muutosehdotukset")
      .select("tyyppi")
      .eq("id", id)
      .maybeSingle();
    kasiteltavaTyyppi = nykyinen?.tyyppi ?? null;
    if (kasiteltavaTyyppi && kuuluuHavaintojonoon(kasiteltavaTyyppi)) {
      seuraavaId = await haeSeuraavaOdottavaHavaintoId(supabase, id);
    }
  }

  const vaadiPerustelu = () => {
    if (perustelu.length < 12) {
      redirect(
        `/yllapito/${id}?virhe=${encodeURIComponent(
          "Kirjoita perustelu (vähintään 12 merkkiä).",
        )}`,
      );
    }
  };

  try {
    const { data: ehdotus, error } = await supabase
      .from("muutosehdotukset")
      .select("id, tila, tyyppi, hanke_id, lahde_url, sisalto")
      .eq("id", id)
      .single();
    if (error || !ehdotus) throw new Error("Ehdotusta ei löytynyt.");
    if (ehdotus.tila !== "odottaa") {
      throw new Error("Ehdotus on jo käsitelty.");
    }

    const sisalto = (ehdotus.sisalto ?? {}) as EhdotusSisalto;
    const ls13 = sisalto.lahdeselvitys13;
    if (!ls13?.kentta) {
      throw new Error("Ehdotus ei ole lähdeselvitys 13 -poikkeama.");
    }

    if (
      (ratkaisu === "korjaa_arvo" || ratkaisu === "vahvistaa_sanamuoto") &&
      ehdotuksellaKerrosalaPintaAlaksi(sisalto)
    ) {
      throw new Error(
        "Lainaus on kerrosalaa (k-m²), ei maa- tai kaava-alaa. Hylkää ehdotus.",
      );
    }
    if (
      (ratkaisu === "korjaa_arvo" || ratkaisu === "vahvistaa_sanamuoto") &&
      ehdotuksellaPintaAlaYksikkoEpaselva(sisalto)
    ) {
      throw new Error(
        "Pinta-alan yksikkö on epäselvä (ei_merkitty tai luku yli 5 000). Vahvista yksikkö ennen julkaisua.",
      );
    }

    if (ratkaisu === "korjaa_arvo") {
      await hyvaksyMuutosehdotus(id, kasittelija);
    } else if (ratkaisu === "vahvistaa_sanamuoto") {
      const rek = ls13.rekisterin_arvo;
      if (rek == null || String(rek).trim() === "") {
        throw new Error(
          "Rekisterin arvo puuttuu — vahvistus eri sanamuodolla ei ole mahdollinen.",
        );
      }
      const kentta = ls13.kentta;
      const vanha = sisalto.kentat?.[kentta];
      if (!vanha || typeof vanha !== "object") {
        throw new Error("Kenttäehdotus puuttuu.");
      }
      const paivitetty: EhdotusSisalto = {
        ...sisalto,
        kentat: {
          ...sisalto.kentat,
          [kentta]: { ...vanha, arvo: String(rek) },
        },
      };
      const yllapito = luoYllapitoAsiakas();
      const { error: paivitysVirhe } = await yllapito
        .from("muutosehdotukset")
        .update({ sisalto: paivitetty })
        .eq("id", id)
        .eq("tila", "odottaa");
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
      await hyvaksyMuutosehdotus(id, kasittelija);
    } else if (ratkaisu === "eri_asia_ei_liiteta") {
      vaadiPerustelu();
      await hylkaaMuutosehdotus(
        id,
        kasittelija,
        `Lähteet tarkoittavat eri asiaa; uutta lähdettä ei liitetty kentälle. ${perustelu}`,
      );
    } else if (ratkaisu === "eri_asia_hankkeen_asiakirja") {
      vaadiPerustelu();
      if (!ehdotus.hanke_id) throw new Error("Hanke puuttuu.");
      const url = String(ehdotus.lahde_url ?? "").trim();
      if (!url) throw new Error("Asiakirjan URL puuttuu.");
      const yllapito = luoYllapitoAsiakas();
      const { data: olemassa } = await yllapito
        .from("dokumentit")
        .select("id, otsikko, laji, muoto, hanke_id")
        .eq("url", url)
        .maybeSingle();
      const otsikko =
        (olemassa?.otsikko && String(olemassa.otsikko).trim()) ||
        (ls13.asiakirjan_nimi && String(ls13.asiakirjan_nimi).trim()) ||
        url;
      const laji =
        (olemassa?.laji && String(olemassa.laji).trim()) || "muu";
      const muoto =
        (olemassa?.muoto && String(olemassa.muoto).trim()) ||
        (/\.pdf(\?|$)/i.test(url) ? "pdf" : null);
      const { error: rpcVirhe } = await yllapito.rpc("lisaa_hanke_dokumentti", {
        p_hanke_id: ehdotus.hanke_id,
        p_url: url,
        p_otsikko: otsikko.slice(0, 200),
        p_laji: laji,
        p_muoto: muoto,
        p_lahde_url: url,
        p_kasittelija: kasittelija,
      });
      if (rpcVirhe) throw new Error(rpcVirhe.message);
      await hylkaaMuutosehdotus(
        id,
        kasittelija,
        `Lähteet tarkoittavat eri asiaa; asiakirja liitetty hankkeen asiakirjoihin, ei kentän lähteeksi. ${perustelu}`,
      );
    } else if (ratkaisu === "ristiriita") {
      vaadiPerustelu();
      if (!ehdotus.hanke_id) throw new Error("Hanke puuttuu.");
      await paivitaKuittausLuottamus(
        ehdotus.hanke_id,
        ls13.kentta,
        "ristiriitainen",
      );
      await hylkaaMuutosehdotus(
        id,
        kasittelija,
        `Lähteet ristiriidassa; luottamus merkitty ristiriitaiseksi. Uutta arvoa ei julkaistu. ${perustelu}`,
      );
    }
  } catch (syy) {
    const viesti =
      syy instanceof Error ? syy.message : "Ratkaisun käsittely epäonnistui.";
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(viesti)}`);
  }

  revalidatePath("/");
  revalidateJulkinenSisalto();
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  revalidatePath(`/yllapito/${id}`);
  if (
    seuraavaJonoon &&
    kasiteltavaTyyppi &&
    kuuluuHavaintojonoon(kasiteltavaTyyppi)
  ) {
    const avain =
      ratkaisu === "korjaa_arvo" || ratkaisu === "vahvistaa_sanamuoto"
        ? "hyvaksytty"
        : "hylatty";
    return redirectHavaintojononJalkeen(supabase, seuraavaId, avain);
  }
  redirect(
    `/yllapito?${
      ratkaisu === "korjaa_arvo" || ratkaisu === "vahvistaa_sanamuoto"
        ? "hyvaksytty"
        : "hylatty"
    }=1`,
  );
}

/**
 * Tallentaa esiversiokuittauksen. httpOnly=false, jotta selain (inline-skripti
 * ja layoutin asiakaskomponentti) voi lukea saman evästeen ilman cookies()-kutsua layoutissa.
 */
export async function kuittaaEsiversio(): Promise<void> {
  const evasteet = await cookies();
  evasteet.set(ESIVERSIO_EVASTE, ESIVERSIO_EVASTE_ARVO, {
    path: "/",
    maxAge: ESIVERSIO_EVASTE_MAX_AGE_S,
    sameSite: "lax",
    httpOnly: false,
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
  const viesti = String(formData.get("viesti") ?? "").trim();

  if (viesti.length < 12) {
    palauteVirhe("Kirjoita viesti (vähintään 12 merkkiä).");
  }
  if (viesti.length > 8000) {
    palauteVirhe("Viesti on liian pitkä.");
  }

  const supabase = await luoPalvelinAsiakas();
  const { error } = await supabase.from("palautteet").insert({
    aihe,
    viesti,
    tila: "odottaa",
  });
  if (error) palauteVirhe(error.message);
  redirect("/yhteys?valmis=1");
}

export async function tallennaLahdeMetatiedotToiminto(formData: FormData): Promise<void> {
  const { kasittelija, supabase } = await vaadiYllapitaja();
  const dokumenttiId = String(formData.get("dokumentti_id") ?? "").trim();
  const lahdeTyyppi = String(formData.get("lahde_tyyppi") ?? "").trim();
  const sitovuustaso = String(formData.get("sitovuustaso") ?? "").trim();
  const otsikko = String(formData.get("otsikko") ?? "");
  const ehdotusIdRaw = String(formData.get("ehdotus_id") ?? "").trim();
  const ehdotusId = ehdotusIdRaw || null;
  const paluu = String(formData.get("paluu") ?? "/yllapito/lahde-tyypit").trim();
  const seuraavaJonoon =
    String(formData.get("seuraava_jonoon") ?? "1").trim() !== "0";
  let seuraavaId: string | null = null;
  if (ehdotusId && seuraavaJonoon) {
    seuraavaId = await haeSeuraavaOdottavaHavaintoId(supabase, ehdotusId);
  }

  if (!dokumenttiId) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Dokumentti puuttuu.")}`);
  }
  if (!(LAHDE_TYYPIT as readonly string[]).includes(lahdeTyyppi)) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Valitse kelvollinen lähdetyyppi.")}`);
  }
  if (!(SITOVUUSTASOT as readonly string[]).includes(sitovuustaso)) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Valitse kelvollinen sitovuustaso.")}`);
  }
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(`${paluu}?virhe=${encodeURIComponent("Tallennus vaatii palvelinavaimen.")}`);
  }

  try {
    await julkaiseDokumenttiLahdeMetatiedot(
      {
        dokumenttiId,
        lahdeTyyppi,
        sitovuustaso,
        otsikko,
        ehdotusId,
      },
      kasittelija,
    );
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Tallennus epäonnistui.";
    redirect(`${paluu}?virhe=${encodeURIComponent(viesti)}`);
  }

  revalidatePath("/yllapito/lahde-tyypit");
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  if (paluu.startsWith("/yllapito/") && paluu !== "/yllapito/lahde-tyypit") {
    revalidatePath(paluu.split("?")[0] ?? paluu);
  }
  const paluuPolku = paluu.split("?")[0] ?? paluu;
  if (
    ehdotusId &&
    seuraavaJonoon &&
    /^\/yllapito\/[0-9a-f-]{36}$/i.test(paluuPolku)
  ) {
    return redirectHavaintojononJalkeen(supabase, seuraavaId, "kasitelty");
  }
  const erotin = paluu.includes("?") ? "&" : "?";
  redirect(`${paluu}${erotin}kasitelty=1`);
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

/** Ylläpidon lukujen läpikäynti: eri asia / ristiriita / korvattu. Heittää virheen asiakkaalle. */
export async function kasitteleLuvunRistiriitaToiminto(formData: FormData): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const taulu = String(formData.get("taulu") ?? "").trim();
  const riviId = String(formData.get("rivi_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const paatos = String(formData.get("paatos") ?? "").trim();
  const huomautus = String(formData.get("huomautus") ?? "").trim() || null;
  const korvattavaLahdeId = String(formData.get("korvattava_lahde_id") ?? "").trim();

  if (taulu !== "hankkeet" || !riviId || !kentta) {
    throw new Error("Puutteellinen kohde.");
  }
  if (!["eri_asia", "ristiriitainen", "korvattu"].includes(paatos)) {
    throw new Error("Tuntematon päätös.");
  }

  const yllapito = luoYllapitoAsiakas();

  if (paatos === "ristiriitainen") {
    const { error } = await yllapito
      .from("kentta_lahteet")
      .update({ luottamus: "ristiriitainen" })
      .eq("taulu", taulu)
      .eq("rivi_id", riviId)
      .eq("kentta", kentta)
      .neq("tila", "korvattu");
    if (error) throw new Error(error.message);
  }

  if (paatos === "korvattu") {
    if (!korvattavaLahdeId) throw new Error("Valitse korvattava lähde.");
    const { data: lahteet, error: lVirhe } = await yllapito
      .from("kentta_lahteet")
      .select("id, lahde_url, tila")
      .eq("taulu", taulu)
      .eq("rivi_id", riviId)
      .eq("kentta", kentta);
    if (lVirhe) throw new Error(lVirhe.message);
    const korvattava = (lahteet ?? []).find((l) => l.id === korvattavaLahdeId);
    if (!korvattava) throw new Error("Korvattavaa lähdettä ei löytynyt.");
    const sailytettava = (lahteet ?? []).find(
      (l) => l.id !== korvattavaLahdeId && l.tila !== "korvattu",
    );
    if (!sailytettava) throw new Error("Säilytettävää lähdettä ei löytynyt.");

    let { data: dok } = await yllapito
      .from("dokumentit")
      .select("id")
      .eq("hanke_id", riviId)
      .eq("url", sailytettava.lahde_url)
      .maybeSingle();
    if (!dok?.id) {
      const { data: dokUrl } = await yllapito
        .from("dokumentit")
        .select("id")
        .eq("url", sailytettava.lahde_url)
        .maybeSingle();
      dok = dokUrl;
    }
    if (!dok?.id) {
      const { data: uusi, error: dVirhe } = await yllapito
        .from("dokumentit")
        .insert({
          hanke_id: riviId,
          url: sailytettava.lahde_url,
          otsikko: sailytettava.lahde_url,
          laji: "verkkosivu",
          muoto: "html",
          julkaistu: true,
          lahde_tyyppi: "muu",
          sitovuustaso: "epavirallinen",
        })
        .select("id")
        .single();
      if (dVirhe || !uusi) throw new Error(dVirhe?.message ?? "Dokumentin luonti epäonnistui.");
      dok = uusi;
      for (const dokKentta of ["otsikko", "laji", "muoto"] as const) {
        const { error: lahdeVirhe } = await yllapito.rpc("tallenna_kentta_lahde", {
          p_taulu: "dokumentit",
          p_rivi_id: dok.id,
          p_kentta: dokKentta,
          p_lahde_url: sailytettava.lahde_url,
          p_lahde_sivu: null,
          p_vahvistettu_pvm: new Date().toISOString().slice(0, 10),
          p_luottamus: "epavarma",
          p_lainaus: "Säilytettävä lähde lukujen läpikäynnissä",
          p_merkitty: "ihmisen_vahvistama",
          p_lahde_laji: "html",
        });
        if (lahdeVirhe) throw new Error(lahdeVirhe.message);
      }
    }

    const { error: kVirhe } = await yllapito
      .from("kentta_lahteet")
      .update({
        tila: "korvattu",
        korvaava_dokumentti_id: dok.id,
      })
      .eq("id", korvattavaLahdeId);
    if (kVirhe) throw new Error(kVirhe.message);
  }

  const { error: jonoVirhe } = await yllapito.from("luvun_lapikaynti").upsert(
    {
      taulu,
      rivi_id: riviId,
      kentta,
      paatos,
      kasittelija,
      huomautus,
      kasitelty_pvm: new Date().toISOString(),
    },
    { onConflict: "taulu,rivi_id,kentta" },
  );
  if (jonoVirhe) throw new Error(jonoVirhe.message);

  revalidatePath("/yllapito/luvut");
  revalidatePath("/yllapito");
  revalidatePath(`/hankkeet/${riviId}`);
}

function uusiHankeIlmoitusPolku(ilmoituksenId: string | undefined): string {
  return ilmoituksenId
    ? `&ilmoituksen_id=${encodeURIComponent(ilmoituksenId)}`
    : "";
}

export async function peruutaUusiHankeEsikatseluToiminto(
  formData: FormData,
): Promise<void> {
  const { user, supabase } = await vaadiYllapitaja();
  const ilmoituksenId = String(formData.get("ilmoituksen_id") ?? "").trim();
  await poistaYllapitoLuonnos(supabase, user.id, UUSI_HANKE_ESIKATSELU_AVAIN);
  redirect(`/yllapito/uusi-hanke?nakyma=json${uusiHankeIlmoitusPolku(ilmoituksenId)}`);
}

/** Vaihe 1–2: validoi JSON ja näytä esikatselu (tila tietokantaan, ei evästeeseen). */
export async function esikatseleUusiHankeTuontiToiminto(
  formData: FormData,
): Promise<void> {
  const { user, supabase } = await vaadiYllapitaja();
  const ilmoituksenIdLomakkeesta = String(
    formData.get("ilmoituksen_id") ?? "",
  ).trim();
  const taydennettyJson = taydennaTyhjaIlmoituksenId(
    String(formData.get("json") ?? ""),
    ilmoituksenIdLomakkeesta,
  );
  let jsonTeksti = taydennettyJson.teksti;
  const tulos = parsiTuontiJsonTekstista(jsonTeksti);
  const ilmoituksenId =
    tulos.tuonti?.ilmoituksen_id?.trim() || ilmoituksenIdLomakkeesta || undefined;
  const nav = uusiHankeIlmoitusPolku(ilmoituksenId);

  if (!tulos.ok || !tulos.tuonti) {
    await tallennaYllapitoLuonnos(supabase, user.id, UUSI_HANKE_ESIKATSELU_AVAIN, {
      vaihe: "virheet",
      json: jsonTeksti,
      virheet: tulos.virheet,
      varoitukset: tulos.varoitukset,
    });
    redirect(`/yllapito/uusi-hanke?nakyma=json${nav}`);
  }

  let tuonti = tulos.tuonti;
  if (ilmoituksenId && !tuonti.ilmoituksen_id) {
    tuonti = { ...tuonti, ilmoituksen_id: ilmoituksenId };
  }
  const varoitukset = [...tulos.varoitukset];
  if (taydennettyJson.taydennetty) {
    varoitukset.push({
      polku: "ilmoituksen_id",
      viesti: `Tyhjä ilmoituksen_id täydennetty ilmoituksen tunnisteella ${ilmoituksenId}.`,
    });
  }
  let sijaintiEsikatselu = null as Awaited<
    ReturnType<typeof taydennaKuntakeskusArvio>
  >["sijainti"] | null;
  try {
    const taydennys = await taydennaKuntakeskusArvio(tuonti, supabase);
    tuonti = taydennys.tuonti;
    sijaintiEsikatselu = taydennys.sijainti;
    if (taydennys.taydennetty) {
      varoitukset.push({
        polku: "sijainti_lat",
        viesti:
          "Koordinaatit puuttuivat — johdettiin kunnan keskustan arvio (sijainti_alue_tyyppi = arvio, lahde_tyyppi = menetelma), kun MML-vastaus täsmäsi kuntaan. Älä siirrä pistettä suunnan/etäisyyden mukaan; sijaintikuvaus kuuluu huomautukseen.",
      });
    } else if (taydennys.sijainti.varoitus) {
      varoitukset.push({
        polku: "sijainti",
        viesti: taydennys.sijainti.varoitus,
      });
    }
  } catch (e) {
    await tallennaYllapitoLuonnos(supabase, user.id, UUSI_HANKE_ESIKATSELU_AVAIN, {
      vaihe: "virheet",
      json: jsonTeksti,
      virheet: [
        ...tulos.virheet,
        {
          polku: "sijainti",
          viesti: e instanceof Error ? e.message : "Kuntakeskusarvio epäonnistui.",
        },
      ],
      varoitukset,
    });
    redirect(`/yllapito/uusi-hanke?nakyma=json${nav}`);
  }

  // Pidä JSON synkassa tuonnin ilmoituksen_id:n kanssa vahvistusta varten.
  if (tuonti.ilmoituksen_id) {
    jsonTeksti = taydennaTyhjaIlmoituksenId(
      jsonTeksti,
      tuonti.ilmoituksen_id,
    ).teksti;
  }

  const tuplat = await haeUusiHankeTuplat(supabase, tuonti);
  const lahdeTyyppiRistiriidat = await haeLahdeTyyppiRistiriidat(supabase, tuonti);
  await tallennaYllapitoLuonnos(supabase, user.id, UUSI_HANKE_ESIKATSELU_AVAIN, {
    vaihe: "esikatselu",
    json: jsonTeksti,
    tuonti,
    varoitukset,
    vainHeikotLahteet: tulos.vainHeikotLahteet,
    tuplat,
    lahdeTyyppiRistiriidat,
    sijaintiEsikatselu,
  });
  redirect(`/yllapito/uusi-hanke?nakyma=json&vaihe=esikatselu${nav}`);
}

/** Vaihe 3: vahvista ja kirjoita RPC:n kautta. */
export async function vahvistaUusiHankeTuontiToiminto(
  formData: FormData,
): Promise<void> {
  const { user, kasittelija, supabase } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `/yllapito/uusi-hanke?virhe=${encodeURIComponent("Palvelinavain puuttuu.")}`,
    );
  }
  const ilmoituksenIdLomakkeesta = String(
    formData.get("ilmoituksen_id") ?? "",
  ).trim();
  const jsonTeksti = taydennaTyhjaIlmoituksenId(
    String(formData.get("json") ?? ""),
    ilmoituksenIdLomakkeesta,
  ).teksti;
  const tulos = parsiTuontiJsonTekstista(jsonTeksti);
  const ilmoituksenId =
    tulos.tuonti?.ilmoituksen_id?.trim() || ilmoituksenIdLomakkeesta || undefined;
  const nav = uusiHankeIlmoitusPolku(ilmoituksenId);

  if (!tulos.ok || !tulos.tuonti) {
    await poistaYllapitoLuonnos(supabase, user.id, UUSI_HANKE_ESIKATSELU_AVAIN);
    redirect(
      `/yllapito/uusi-hanke?virhe=${encodeURIComponent(
        tulos.virheet.map((v) => v.viesti).join(" ") || "Validointi epäonnistui.",
      )}${nav}`,
    );
  }

  let tuonti = tulos.tuonti;
  if (ilmoituksenId && !tuonti.ilmoituksen_id) {
    tuonti = { ...tuonti, ilmoituksen_id: ilmoituksenId };
  }

  let kirjoitus;
  try {
    const ristiriidat = await haeLahdeTyyppiRistiriidat(supabase, tuonti);
    const lahdeTyyppiPaatokset = parsiLahdeTyyppiPaatokset(
      formData,
      ristiriidat,
    );
    kirjoitus = await kirjoitaUusiHankeTuonti({
      tuonti,
      kasittelija,
      vainHeikotLahteet: tulos.vainHeikotLahteet,
      lahdeTyyppiPaatokset,
    });
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : "Kirjoitus epäonnistui.";
    // Pidä esikatseluluonnos, jotta valinnat voi täydentää
    redirect(
      `/yllapito/uusi-hanke?nakyma=json&vaihe=esikatselu&virhe=${encodeURIComponent(viesti)}${nav}`,
    );
  }

  await poistaYllapitoLuonnos(supabase, user.id, UUSI_HANKE_ESIKATSELU_AVAIN);
  revalidatePath("/");
  revalidateJulkinenSisalto();
  revalidatePath("/yllapito");
  revalidatePath("/hankkeet", "layout");
  if (kirjoitus.tila === "julkaistu") {
    redirect(`/hankkeet/${kirjoitus.hanke_id}?luotu=1`);
  }
  if (kirjoitus.tila === "hankevinkki") {
    redirect(
      `/yllapito/${kirjoitus.ehdotus_id}?vihje=${encodeURIComponent(
        "Hanke tallennettiin hankevinkiksi ja odottavaksi ehdotukseksi (vain media/hankkeen_oma -lähteet).",
      )}`,
    );
  }
  redirect(`/yllapito/${kirjoitus.ehdotus_id}`);
}

/** Kenttäkohtainen lomake → sama JSON-putki. */
export async function esikatseleUusiHankeLomakeToiminto(
  formData: FormData,
): Promise<void> {
  const kentat: Array<{
    kentta: string;
    arvo: string;
    lahteet: Array<{
      url: string;
      lahde_tyyppi: string;
      lainaus: string;
      sivu?: string;
    }>;
  }> = [];

  const nimet = formData.getAll("kentta_nimi").map(String);
  const arvot = formData.getAll("kentta_arvo").map(String);
  const urlt = formData.getAll("kentta_lahde_url").map(String);
  const tyypit = formData.getAll("kentta_lahde_tyyppi").map(String);
  const lainaukset = formData.getAll("kentta_lainaus").map(String);
  const sivut = formData.getAll("kentta_sivu").map(String);

  for (let i = 0; i < nimet.length; i++) {
    const kentta = nimet[i]?.trim() ?? "";
    const arvo = arvot[i]?.trim() ?? "";
    if (!kentta || !arvo) continue;
    kentat.push({
      kentta,
      arvo,
      lahteet: [
        {
          url: urlt[i]?.trim() ?? "",
          lahde_tyyppi: tyypit[i]?.trim() ?? "",
          lainaus: lainaukset[i]?.trim() ?? "",
          sivu: sivut[i]?.trim() || undefined,
        },
      ],
    });
  }

  const juuriNimi = String(formData.get("nimi") ?? "").trim();
  const juuriKunta = String(formData.get("kunta") ?? "").trim();
  const juuriVaihe = String(formData.get("vaihe") ?? "").trim();
  // Jos juuri täytetty mutta kenttärivi puuttuu, vaadi silti kenttärivit
  // (validointi ilmoittaa puutteesta) — täydennä arvo kenttään jos rivi on.
  for (const [kentta, arvo] of [
    ["nimi", juuriNimi],
    ["kunta", juuriKunta],
    ["vaihe", juuriVaihe],
  ] as const) {
    const rivi = kentat.find((k) => k.kentta === kentta);
    if (rivi && !rivi.arvo && arvo) rivi.arvo = arvo;
  }

  const toimijaNimi = String(formData.get("toimija_nimi") ?? "").trim();
  const objekti = {
    nimi: juuriNimi,
    kunta: juuriKunta,
    vaihe: juuriVaihe,
    huomautus: String(formData.get("huomautus") ?? "").trim() || undefined,
    ilmoituksen_id:
      String(formData.get("ilmoituksen_id") ?? "").trim() || undefined,
    toimija: toimijaNimi
      ? {
          nimi: toimijaNimi,
          y_tunnus: String(formData.get("toimija_y_tunnus") ?? "").trim() || undefined,
          lahde_url: String(formData.get("toimija_lahde_url") ?? "").trim(),
          lahde_tyyppi: String(formData.get("toimija_lahde_tyyppi") ?? "").trim(),
          lainaus: String(formData.get("toimija_lainaus") ?? "").trim(),
        }
      : null,
    kentat,
    roolit: [] as unknown[],
    asiakirjat: [] as unknown[],
  };

  const fd = new FormData();
  fd.set("json", JSON.stringify(objekti, null, 2));
  const ilmoitus = String(formData.get("ilmoituksen_id") ?? "").trim();
  if (ilmoitus) fd.set("ilmoituksen_id", ilmoitus);
  await esikatseleUusiHankeTuontiToiminto(fd);
}

/** Viranomaislähde tukee arvoa → merkitty = ihmisen_vahvistama. */
export async function kasitteleViranomaisVahvistusTukeeToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const lahdeIdt = String(formData.get("lahde_idt") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lahdeIdt.length === 0) throw new Error("Lähde puuttuu.");

  const yllapito = luoYllapitoAsiakas();
  const { data: lahdeRivit, error: hakuVirhe } = await yllapito
    .from("kentta_lahteet")
    .select("id, lahde_url")
    .in("id", lahdeIdt);
  if (hakuVirhe) throw new Error(hakuVirhe.message);
  const { onKoostepalveluUrl } = await import("@/lib/lahde-tyyppi-domain");
  const koosteIdt: string[] = [];
  const muutIdt: string[] = [];
  for (const id of lahdeIdt) {
    const rivi = (lahdeRivit ?? []).find((r) => r.id === id);
    if (rivi && onKoostepalveluUrl(rivi.lahde_url)) koosteIdt.push(id);
    else muutIdt.push(id);
  }
  let paivitetty = 0;
  if (muutIdt.length > 0) {
    const { data, error } = await yllapito.rpc("kuitaa_kentta_lahteet", {
      p_lahde_idt: muutIdt,
      p_kasittelija: kasittelija,
      p_luottamus: "vahvistettu",
    });
    if (error) throw new Error(error.message);
    paivitetty += typeof data === "number" ? data : 0;
  }
  if (koosteIdt.length > 0) {
    const { data, error } = await yllapito.rpc("kuitaa_kentta_lahteet", {
      p_lahde_idt: koosteIdt,
      p_kasittelija: kasittelija,
      p_luottamus: "epavarma",
    });
    if (error) throw new Error(error.message);
    paivitetty += typeof data === "number" ? data : 0;
  }
  if (paivitetty === 0) {
    throw new Error("Yhtään koneen ehdottamaa lähdettä ei päivitetty.");
  }

  revalidatePath("/yllapito/viranomais-vahvistus");
  revalidatePath("/yllapito");
  const hankeId = String(formData.get("rivi_id") ?? "").trim();
  if (hankeId) revalidatePath(`/hankkeet/${hankeId}`);
}

/** Lähde ei tue arvoa → poikkeama muutosehdotukset-jonoon. */
export async function kasitteleViranomaisVahvistusEiTueToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const taulu = String(formData.get("taulu") ?? "").trim();
  const riviId = String(formData.get("rivi_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const hankeId = String(formData.get("hanke_id") ?? "").trim() || null;
  const lahdeUrl = String(formData.get("lahde_url") ?? "").trim();
  const arvo = String(formData.get("arvo") ?? "").trim();
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  if (!taulu || !riviId || !kentta || !lahdeUrl) {
    throw new Error("Puutteellinen kohde.");
  }
  if (huomautus.length < 12) {
    throw new Error("Huomautus on liian lyhyt.");
  }

  const yllapito = luoYllapitoAsiakas();
  const { error } = await yllapito.from("muutosehdotukset").insert({
    tyyppi: "korjaus",
    hanke_id: hankeId,
    ehdottaja_tyyppi: "yllapitaja",
    ehdottaja_tunniste: "viranomais_vahvistus_ei_tue",
    lahde_url: lahdeUrl,
    huomautus: `Viranomaislähde ei tue arvoa (${taulu}.${kentta}${arvo ? ` = ${arvo}` : ""}): ${huomautus}`,
    tila: "odottaa",
    sisalto: {
      kentat: {},
      viranomais_vahvistus: {
        taulu,
        rivi_id: riviId,
        kentta,
        arvo: arvo || null,
        lahde_url: lahdeUrl,
        huomautus,
        kasittelija,
      },
    },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/yllapito/viranomais-vahvistus");
  revalidatePath("/yllapito");
}

/** Uusi hanke -ilmoitus on oikeasti täydennys olemassa olevaan. */
export async function taydennaUusiHankeOlemassaOlevalleToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija, supabase } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    redirect(
      `/yllapito?virhe=${encodeURIComponent("Tallennus vaatii palvelinavaimen.")}`,
    );
  }
  const id = String(formData.get("id") ?? "").trim();
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const perustelu = String(formData.get("perustelu") ?? "").trim();
  if (!id || !hankeId) {
    redirect(
      `/yllapito/${id || ""}?virhe=${encodeURIComponent("Valitse olemassa oleva hanke.")}`,
    );
  }

  const { data: ehdotus, error: eVirhe } = await supabase
    .from("muutosehdotukset")
    .select("id, tyyppi, tila")
    .eq("id", id)
    .maybeSingle();
  if (eVirhe || !ehdotus) {
    redirect(`/yllapito?virhe=${encodeURIComponent("Ehdotusta ei löytynyt.")}`);
  }
  if (ehdotus.tyyppi !== "uusi_hanke" || ehdotus.tila !== "odottaa") {
    redirect(
      `/yllapito/${id}?virhe=${encodeURIComponent("Vain odottava uusi hanke -ilmoitus.")}`,
    );
  }

  const { data: hanke, error: hVirhe } = await supabase
    .from("hankkeet")
    .select("id, nimi, kunta, yhdistetty_kohde_id")
    .eq("id", hankeId)
    .maybeSingle();
  if (hVirhe || !hanke || hanke.yhdistetty_kohde_id) {
    redirect(
      `/yllapito/${id}?virhe=${encodeURIComponent("Kohdehanketta ei löytynyt.")}`,
    );
  }

  const teksti =
    perustelu ||
    `Täydennetty olemassa olevaa hanketta ${hanke.nimi} (${hankeId}). Ei uutta hanketta.`;

  const yllapito = luoYllapitoAsiakas();
  const { error } = await yllapito
    .from("muutosehdotukset")
    .update({
      tila: "hyvaksytty",
      hanke_id: hankeId,
      kasitelty_pvm: new Date().toISOString(),
      kasittelija,
      perustelu: teksti,
    })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) {
    redirect(`/yllapito/${id}?virhe=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/yllapito");
  revalidatePath(`/yllapito/${id}`);
  revalidatePath(`/hankkeet/${hankeId}`);
  redirect(`/yllapito/${id}?kasitelty=1`);
}

/** Aseta lainauksen_luonne (ihmisen luokitus). */
export async function asetaLainauksenLuonneToiminto(
  formData: FormData,
): Promise<void> {
  await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const lahdeId = String(formData.get("lahde_id") ?? "").trim();
  const luonne = String(formData.get("lainauksen_luonne") ?? "").trim();
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  if (!lahdeId || !luonne) throw new Error("Lähde tai luonne puuttuu.");

  const yllapito = luoYllapitoAsiakas();
  const { error } = await yllapito.rpc("aseta_lahde_lainauksen_luonne", {
    p_lahde_id: lahdeId,
    p_luonne: luonne,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/yllapito/viranomais-vahvistus");
  revalidatePath("/yllapito");
  if (hankeId) revalidatePath(`/hankkeet/${hankeId}`);
}

/** LS13-erä: lainaus tukee → merkitse yksittäiseksi (pois eräjonosta). */
export async function kasitteleLs13EraTukeeToiminto(
  formData: FormData,
): Promise<void> {
  await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const kentta = String(formData.get("kentta") ?? "").trim();
  const lahdeUrl = String(formData.get("lahde_url") ?? "").trim();
  if (!hankeId || !kentta || !lahdeUrl) {
    throw new Error("Puutteellinen kohde.");
  }

  const yllapito = luoYllapitoAsiakas();
  const { data, error } = await yllapito.rpc("aseta_lahde_kuittaustapa", {
    p_taulu: "hankkeet",
    p_rivi_id: hankeId,
    p_kentta: kentta,
    p_lahde_url: lahdeUrl,
    p_kuittaustapa: "yksittain",
    p_eratunniste: null,
  });
  if (error) throw new Error(error.message);
  if (typeof data === "number" && data === 0) {
    throw new Error("Lähderivää ei päivitetty (ei ihmisen vahvistamaa osumaa).");
  }

  revalidatePath("/yllapito/ls13-era-kuittaukset");
  revalidatePath("/yllapito");
  revalidatePath(`/hankkeet/${hankeId}`);
}

function organisaatioGleifPaluu(
  organisaatioId: string,
  params: Record<string, string>,
): never {
  const q = new URLSearchParams(params);
  redirect(`/organisaatiot/${organisaatioId}?${q.toString()}`);
}

/** Ylläpito: GLEIF-haku rekisterinumerolla tai nimellä → ehdokaslista. */
export async function haeGleifOrganisaatiolleToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija: _k } = await vaadiYllapitaja();
  const organisaatioId = String(formData.get("organisaatio_id") ?? "").trim();
  const tapa = String(formData.get("tapa") ?? "").trim();
  const nimiHaku = String(formData.get("nimi") ?? "").trim();
  if (!organisaatioId) {
    redirect(`/hakemisto?virhe=${encodeURIComponent("Organisaatio puuttuu.")}`);
  }
  if (tapa === "nimi") {
    if (nimiHaku.length < 3) {
      organisaatioGleifPaluu(organisaatioId, {
        gleif_virhe: "Nimihakuun tarvitaan vähintään kolme merkkiä.",
      });
    }
    organisaatioGleifPaluu(organisaatioId, {
      gleif_tila: "haku",
      tapa: "nimi",
      q: nimiHaku,
    });
  }
  organisaatioGleifPaluu(organisaatioId, {
    gleif_tila: "haku",
    tapa: "rekisteri",
  });
}

/** Ylläpito: valitse GLEIF-ehdokas vahvistettavaksi. */
export async function valitseGleifEhdokasToiminto(
  formData: FormData,
): Promise<void> {
  await vaadiYllapitaja();
  const organisaatioId = String(formData.get("organisaatio_id") ?? "").trim();
  const lei = String(formData.get("lei") ?? "").trim().toUpperCase();
  if (!organisaatioId || !lei) {
    redirect(`/hakemisto?virhe=${encodeURIComponent("LEI tai organisaatio puuttuu.")}`);
  }
  organisaatioGleifPaluu(organisaatioId, {
    gleif_tila: "vahvista",
    lei,
  });
}

/** Ylläpito: tallenna vahvistettu LEI ja jonota emo-suhteet. */
export async function vahvistaGleifLeiToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const { haeGleifLeiTietue, gleifTietueUrl } = await import("@/lib/gleif");
  const organisaatioId = String(formData.get("organisaatio_id") ?? "").trim();
  const lei = String(formData.get("lei") ?? "").trim().toUpperCase();
  if (!organisaatioId || !lei) {
    redirect(`/hakemisto?virhe=${encodeURIComponent("LEI tai organisaatio puuttuu.")}`);
  }

  const haettu = await haeGleifLeiTietue(lei);
  if (!haettu) {
    organisaatioGleifPaluu(organisaatioId, {
      gleif_virhe: "LEI-tietuetta ei löytynyt GLEIF:stä.",
    });
  }
  const tulos = haettu!;

  const suoraPoikkeus =
    tulos.suora_emo?.tyyppi === "poikkeus" ? tulos.suora_emo.syy : null;
  const ylinPoikkeus =
    tulos.ylin_emo?.tyyppi === "poikkeus" ? tulos.ylin_emo.syy : null;

  const yllapito = luoYllapitoAsiakas();
  const { error: rpcVirhe } = await yllapito.rpc("julkaise_organisaatio_lei", {
    p_organisaatio_id: organisaatioId,
    p_lei: tulos.lei,
    p_lei_tila: tulos.lei_tila,
    p_lei_paivitetty_pvm: tulos.lei_paivitetty_pvm,
    p_lahde_url: tulos.lahde_url,
    p_kasittelija: kasittelija,
    p_gleif_suora_emo_poikkeus: suoraPoikkeus,
    p_gleif_ylin_emo_poikkeus: ylinPoikkeus,
  });
  if (rpcVirhe) {
    organisaatioGleifPaluu(organisaatioId, {
      gleif_virhe: rpcVirhe.message,
    });
  }

  const { data: orgRivi } = await yllapito
    .from("organisaatiot")
    .select("nimi")
    .eq("id", organisaatioId)
    .maybeSingle();
  const orgNimi = (orgRivi?.nimi as string | undefined) ?? organisaatioId;
  const leiLahdeUrl = gleifTietueUrl(tulos.lei);

  async function jonotaEmo(
    suhdeTunnus: "gleif_suora_emo" | "gleif_ylin_emo",
    emo: NonNullable<(typeof tulos)["suora_emo"]>,
  ): Promise<void> {
    if (emo.tyyppi !== "suhde") return;
    const lainaus = `GLEIF ${suhdeTunnus === "gleif_suora_emo" ? "direct" : "ultimate"} parent: ${emo.nimi} (${emo.lei})`;
    const { data: vanha } = await yllapito
      .from("muutosehdotukset")
      .select("id")
      .eq("tyyppi", "organisaatio_suhde")
      .eq("tila", "odottaa")
      .contains("sisalto", {
        organisaatio_suhde: {
          suhde_tunnus: suhdeTunnus,
          lahde_organisaatio_id: organisaatioId,
          emo_lei: emo.lei,
        },
      })
      .maybeSingle();
    if (vanha) return;

    const { error: jonoVirhe } = await yllapito.from("muutosehdotukset").insert({
      tyyppi: "organisaatio_suhde",
      tila: "odottaa",
      ehdottaja_tyyppi: "yllapitaja",
      ehdottaja_tunniste: kasittelija,
      lahde_url: leiLahdeUrl,
      huomautus: `GLEIF-emosuhde: ${orgNimi} → ${emo.nimi}`,
      sisalto: {
        kentat: {},
        organisaatio_suhde: {
          suhde_tunnus: suhdeTunnus,
          lahde_organisaatio_id: organisaatioId,
          lahde_organisaatio_nimi: orgNimi,
          emo_lei: emo.lei,
          emo_nimi: emo.nimi,
          emo_rekisterinumero: emo.rekisterinumero,
          emo_rekisteriviranomainen: emo.rekisteriviranomainen,
          emo_maa: emo.maa,
          lahde_url: leiLahdeUrl,
          lainaus,
        },
      },
    });
    if (jonoVirhe) throw new Error(jonoVirhe.message);
  }

  if (tulos.suora_emo) await jonotaEmo("gleif_suora_emo", tulos.suora_emo);
  if (tulos.ylin_emo) await jonotaEmo("gleif_ylin_emo", tulos.ylin_emo);

  revalidatePath(`/organisaatiot/${organisaatioId}`);
  revalidatePath("/toimijat");
  revalidatePath("/yllapito");
  organisaatioGleifPaluu(organisaatioId, { gleif_valmis: "1" });
}

/** LS13-erä: ei tue → peruuta kuittaus (merkitty=koneen_ehdottama). */
export async function kasitteleLs13EraEiTueToiminto(
  formData: FormData,
): Promise<void> {
  const { kasittelija } = await vaadiYllapitaja();
  if (!supabasePalvelinAvainAsetettu()) {
    throw new Error("Tallennus vaatii palvelinavaimen.");
  }
  const lahdeId = String(formData.get("lahde_id") ?? "").trim();
  const hankeId = String(formData.get("hanke_id") ?? "").trim();
  const huomautus = String(formData.get("huomautus") ?? "").trim();
  if (!lahdeId) throw new Error("Lähde puuttuu.");
  if (huomautus.length < 12) {
    throw new Error("Huomautus on liian lyhyt.");
  }

  const yllapito = luoYllapitoAsiakas();
  const { data, error } = await yllapito.rpc("peruuta_kentta_lahde_kuittaus", {
    p_lahde_idt: [lahdeId],
    p_kasittelija: kasittelija,
    p_huomautus: huomautus,
  });
  if (error) throw new Error(error.message);
  if (typeof data === "number" && data === 0) {
    throw new Error("Kuittauksen peruutus ei päivittänyt rivejä.");
  }

  revalidatePath("/yllapito/ls13-era-kuittaukset");
  revalidatePath("/yllapito");
  if (hankeId) revalidatePath(`/hankkeet/${hankeId}`);
}
