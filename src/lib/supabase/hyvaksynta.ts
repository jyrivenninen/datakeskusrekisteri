import {
  kentanLuottamus,
  kenttaArvoksi,
  normalisoiKenttaTyhjennysSisalto,
  VAIHTOEHTO_KENTAT,
  type EhdotettuKentta,
  type EhdotusSisalto,
} from "@/lib/ehdotus";
import { ehdotuksenHankeIdt } from "@/lib/naytto";
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
  const lainaus =
    tieto.lainaus == null || tieto.lainaus === ""
      ? ""
      : String(tieto.lainaus);
  return {
    kentta,
    lahde_url: String(tieto.lahde_url),
    lahde_sivu: tieto.lahde_sivu == null ? "" : String(tieto.lahde_sivu),
    lahde_laji: lahdeLajiRiville(tieto),
    vahvistettu_pvm: tanaan(),
    luottamus: kentanLuottamus(tieto, oletusLuottamus),
    lainaus,
    merkitty: "ihmisen_vahvistama" as const,
  };
}

function ristiriitaEiUudelleenPerustelu(teksti: string | undefined): string {
  const t = (teksti ?? "").trim();
  if (t.length < 12) {
    throw new Error(
      "Kirjaa miksi havainto ei nouse uudelleen (vähintään 12 merkkiä).",
    );
  }
  return t;
}

function ristiriitaSisaltoEiUudelleen(
  sisalto: EhdotusSisalto,
  perustelu: string,
): EhdotusSisalto {
  if (!sisalto.ristiriita) return sisalto;
  return {
    ...sisalto,
    ristiriita: {
      ...sisalto.ristiriita,
      ei_uudelleen: true,
      ei_uudelleen_perustelu: perustelu,
    },
  };
}

export async function yhdistaHankkeetEhdotuksesta(
  ehdotusId: string,
  kasittelija: string,
  sailytettavaId: string,
  perustelu: string,
) {
  const teksti = ristiriitaEiUudelleenPerustelu(perustelu);
  const supabase = luoYllapitoAsiakas();
  const { data: ehdotus, error } = await supabase
    .from("muutosehdotukset")
    .select("*")
    .eq("id", ehdotusId)
    .single();
  if (error || !ehdotus) throw new Error("Ehdotusta ei löytynyt.");
  if (ehdotus.tila !== "odottaa") throw new Error("Ehdotus on jo käsitelty.");
  if (ehdotus.tyyppi !== "ristiriita_havainto") {
    throw new Error("Yhdistäminen on vain ristiriitahavainnoille.");
  }
  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  const idt = ehdotuksenHankeIdt(ehdotus.hanke_id, sisalto.ristiriita);
  if (idt.length !== 2 || !idt.includes(sailytettavaId)) {
    throw new Error("Valitse toinen havainnon kahdesta hankkeesta säilytettäväksi.");
  }
  const siirrettavaId = idt.find((id) => id !== sailytettavaId);
  if (!siirrettavaId) throw new Error("Siirrettävä hanke puuttuu.");
  const { error: rpcVirhe } = await supabase.rpc("yhdista_hankkeet", {
    p_sailytettava: sailytettavaId,
    p_siirrettava: siirrettavaId,
    p_ehdotus_id: ehdotusId,
    p_kasittelija: kasittelija,
    p_perustelu: teksti,
  });
  if (rpcVirhe) throw new Error(rpcVirhe.message);
}

export async function hyvaksyMuutosehdotus(
  ehdotusId: string,
  kasittelija: string,
  valinnat?: { perustelu?: string },
) {
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

  if (ehdotus.hanke_id) {
    const { data: hanke, error: hankeVirhe } = await supabase
      .from("hankkeet")
      .select("yhdistetty_kohde_id")
      .eq("id", ehdotus.hanke_id)
      .maybeSingle();
    if (hankeVirhe) throw new Error(hankeVirhe.message);
    if (hanke?.yhdistetty_kohde_id) {
      throw new Error(
        "Hanke on poistettu duplikaattina — ehdotusta ei voi hyväksyä. Täydennä kohdehanketta.",
      );
    }
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

  if (ehdotus.tyyppi === "kentta_tarkistus") {
    const { error: rpcVirhe } = await supabase.rpc("julkaise_kentta_tarkistus", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return;
  }

  if (ehdotus.tyyppi === "kentta_tyhjennys") {
    const alkuperainen = ehdotus.sisalto as EhdotusSisalto;
    const korjattu = normalisoiKenttaTyhjennysSisalto(
      alkuperainen,
      ehdotus.hanke_id!,
      ehdotus.huomautus,
      ehdotus.lahde_url,
    );
    if (!korjattu.tyhjennys?.kentta) {
      throw new Error("Tyhjennys: kentta puuttuu");
    }
    if (!alkuperainen.tyhjennys?.kentta?.trim()) {
      const { error: paivitysVirhe } = await supabase
        .from("muutosehdotukset")
        .update({ sisalto: korjattu })
        .eq("id", ehdotusId)
        .eq("tila", "odottaa");
      if (paivitysVirhe) throw new Error(paivitysVirhe.message);
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_kentta_tyhjennys", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return;
  }

  if (ehdotus.tyyppi === "paatos") {
    const paatos = (ehdotus.sisalto as EhdotusSisalto).paatos;
    if (!paatos?.kuvaus?.trim() || !paatos?.pvm?.trim()) {
      throw new Error("Paatos-ehdotuksesta puuttuvat kuvaus tai pvm.");
    }
    if (!Array.isArray(paatos.lahteet) || paatos.lahteet.length === 0) {
      throw new Error("Paatos-ehdotuksesta puuttuvat lähderivit (lahteet).");
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_paatos", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return;
  }

  if (ehdotus.tyyppi === "maaraaja") {
    const maaraaja = (ehdotus.sisalto as EhdotusSisalto).maaraaja;
    if (!maaraaja?.tyyppi?.trim() || !maaraaja?.paattyy_pvm?.trim()) {
      throw new Error("Määräaikaehdotuksesta puuttuvat tyyppi tai päättymispäivä.");
    }
    if (!Array.isArray(maaraaja.lahteet) || maaraaja.lahteet.length === 0) {
      throw new Error("Määräaikaehdotuksesta puuttuvat lähderivit (lahteet).");
    }
    const { error: rpcVirhe } = await supabase.rpc("julkaise_maaraaja", {
      p_ehdotus_id: ehdotusId,
      p_kasittelija: kasittelija,
    });
    if (rpcVirhe) throw new Error(rpcVirhe.message);
    return;
  }

  if (
    ehdotus.tyyppi === "linkki_rikki" ||
    ehdotus.tyyppi === "ryhti_havainto" ||
    ehdotus.tyyppi === "kunta_havainto" ||
    ehdotus.tyyppi === "ytj_havainto" ||
    ehdotus.tyyppi === "mml_havainto" ||
    ehdotus.tyyppi === "dokumentti_muuttunut" ||
    ehdotus.tyyppi === "ristiriita_havainto"
  ) {
    const sisalto = ehdotus.sisalto as EhdotusSisalto;
    let ristiriitaPaivitys: Record<string, unknown> = {};
    if (ehdotus.tyyppi === "ristiriita_havainto") {
      const perustelu = ristiriitaEiUudelleenPerustelu(valinnat?.perustelu);
      ristiriitaPaivitys = {
        sisalto: ristiriitaSisaltoEiUudelleen(sisalto, perustelu),
        perustelu,
      };
    }
    const { error: paivitysVirhe } = await supabase
      .from("muutosehdotukset")
      .update({
        tila: "hyvaksytty",
        kasitelty_pvm: new Date().toISOString(),
        kasittelija,
        ...ristiriitaPaivitys,
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

export async function kuitaaHankeKentat(
  hankeId: string,
  kentat: string[],
  kasittelija: string,
  luottamus: "vahvistettu" | "epavarma" = "vahvistettu",
) {
  const supabase = luoYllapitoAsiakas();
  const { data, error } = await supabase.rpc("kuitaa_hanke_kentat", {
    p_hanke_id: hankeId,
    p_kentat: kentat,
    p_kasittelija: kasittelija,
    p_luottamus: luottamus,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

/** Luottamus ilman kuittausta — merkintä pysyy koneen ehdottamana. */
export async function paivitaKuittausLuottamus(
  hankeId: string,
  kentta: string,
  luottamus: "vahvistettu" | "epavarma" | "ristiriitainen",
) {
  const supabase = luoYllapitoAsiakas();
  const { data, error } = await supabase
    .from("kentta_lahteet")
    .update({ luottamus })
    .eq("taulu", "hankkeet")
    .eq("rivi_id", hankeId)
    .eq("kentta", kentta)
    .eq("merkitty", "koneen_ehdottama")
    .select("kentta");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

/** Korjaa julkaistun kentän lähde-URL (esim. siirtynyt PDF). Arvoa ei muuteta. */
export async function paivitaKenttaLahdeUrl(
  taulu: string,
  riviId: string,
  kentta: string,
  vanhaUrl: string,
  uusiUrl: string,
) {
  const uusi = uusiUrl.trim();
  if (!/^https?:\/\//i.test(uusi)) {
    throw new Error("Uusi lähde-URL puuttuu tai on virheellinen.");
  }
  const supabase = luoYllapitoAsiakas();
  const { data, error } = await supabase
    .from("kentta_lahteet")
    .update({
      lahde_url: uusi,
      vahvistettu_pvm: tanaan(),
    })
    .eq("taulu", taulu)
    .eq("rivi_id", riviId)
    .eq("kentta", kentta)
    .eq("lahde_url", vanhaUrl.trim())
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("Lähdettä ei löytynyt. Tarkista, ettei URL:ää ole jo korjattu.");
  }
}

export async function piilotaHankeKuva(kuvaId: string, kasittelija: string) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("piilota_hanke_kuva", {
    p_kuva_id: kuvaId,
    p_kasittelija: kasittelija,
  });
  if (error) throw new Error(error.message);
}

export async function julkaiseHanke(hankeId: string, kasittelija: string) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("julkaise_hanke", {
    p_hanke_id: hankeId,
    p_kasittelija: kasittelija,
  });
  if (error) throw new Error(error.message);
}

export async function merkitseHankeDuplikaatiksi(
  duplikaattiId: string,
  kohdeId: string,
  kasittelija: string,
  perustelu: string,
) {
  const supabase = luoYllapitoAsiakas();
  const { error } = await supabase.rpc("merkitse_hanke_duplikaatiksi", {
    p_duplikaatti: duplikaattiId,
    p_kohde: kohdeId,
    p_kasittelija: kasittelija,
    p_perustelu: perustelu,
  });
  if (error) throw new Error(error.message);
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