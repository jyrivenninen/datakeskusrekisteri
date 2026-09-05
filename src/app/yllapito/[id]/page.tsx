import { notFound, redirect } from "next/navigation";
import { hyvaksyEhdotusToiminto, hylkaaEhdotusToiminto, julkaiseHankeToiminto, korjaaLinkkiLahdeToiminto } from "@/app/toiminnot";
import { EhdotusLuokka, EhdotusTila } from "@/komponentit/ehdotus-tila";
import {
  ehdotuksenHankeIdt,
  HANKE_KENTTA_NIMET,
  LUOTTAMUS_NIMET,
  MERKINTA_NIMET,
  PAATOS_KENTTA_NIMET,
  hyvaksyPainikeTeksti,
  kasittelySelite,
  MAARAAJA_KENTTA_NIMET,
  MAARAAJA_NIMET,
  MUUTOSEHDOTUS_TYYPPI_NIMET,
  RISTIRIITA_SAANTO_NIMET,
  VAIHE_NIMET,
} from "@/lib/naytto";
import {
  kuntaNimetKoodeista,
  RYHTI_HAKUEHTO_NIMET,
  ryhtiHylkaysPerusteluEhdotus,
  ryhtiVaroitukset,
} from "@/lib/ryhti-vertailu";
import { haeKirjautunutKayttaja } from "@/lib/supabase/palvelin";
import { haeKenttaTyhjennysNakyma, type EhdotusSisalto } from "@/lib/ehdotus";
import {
  haeHankkeetYllapitoon,
  supabasePalvelinAvainAsetettu,
} from "@/lib/supabase/yllapito-asiakas";

async function vaadiYllapitaja() {
  const { user, supabase } = await haeKirjautunutKayttaja();
  if (!user) redirect("/kirjaudu");
  const { data } = await supabase
    .from("yllapitajat")
    .select("kayttaja_id")
    .eq("kayttaja_id", user.id)
    .maybeSingle();
  if (!data) redirect("/kirjaudu?virhe=" + encodeURIComponent("Ei ylläpito-oikeutta."));
  return supabase;
}

export default async function EhdotusSivu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ virhe?: string; julkaistu?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await vaadiYllapitaja();
  const { data: ehdotus } = await supabase
    .from("muutosehdotukset")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!ehdotus) notFound();
  const sisalto = ehdotus.sisalto as EhdotusSisalto;
  const odottaa = ehdotus.tila === "odottaa";
  const hyvaksyTeksti = hyvaksyPainikeTeksti(ehdotus.tyyppi, {
    ytjEhdotaTunnus: Boolean(sisalto.ytj?.ehdota_tunnus),
  });
  const linkki = sisalto.linkki;
  const ryhti = sisalto.ryhti;
  const ytj = sisalto.ytj;
  const mml = sisalto.mml;
  const dokumentti = sisalto.dokumentti;
  const ristiriita = sisalto.ristiriita;
  const hankeIdt = ehdotuksenHankeIdt(ehdotus.hanke_id, ristiriita);
  let hankkeet = await haeHankkeetYllapitoon(hankeIdt);
  if (hankkeet.length === 0 && hankeIdt.length > 0) {
    const { data } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, vaihe, julkaistu")
      .in("id", hankeIdt);
    hankkeet = data ?? [];
  }
  const hankeNimella = new Map(hankkeet.map((hanke) => [hanke.id, hanke]));
  const kasittely = kasittelySelite(ehdotus.kasittelija, ehdotus.kasitelty_pvm);
  const paatosLahteet = sisalto.paatos?.lahteet ?? [];
  const paatosLahteetPuuttuu =
    sisalto.paatos != null && !Array.isArray(sisalto.paatos.lahteet);
  const maaraajaLahteet = sisalto.maaraaja?.lahteet ?? [];
  const maaraajaLahteetPuuttuu =
    sisalto.maaraaja != null && !Array.isArray(sisalto.maaraaja.lahteet);
  const tyhjennysNakyma =
    ehdotus.tyyppi === "kentta_tyhjennys" && ehdotus.hanke_id
      ? haeKenttaTyhjennysNakyma(sisalto, ehdotus.hanke_id, ehdotus.huomautus, ehdotus.lahde_url)
      : null;

  let tyhjennysHanke: { julkaistu: boolean; kenttaArvo: string | null } | null = null;
  if (tyhjennysNakyma && ehdotus.hanke_id) {
    const { data: hankeRivi } = await supabase
      .from("hankkeet")
      .select("*")
      .eq("id", ehdotus.hanke_id)
      .maybeSingle();
    if (hankeRivi) {
      const avain = tyhjennysNakyma.tyhjennys.kentta as keyof typeof hankeRivi;
      const raw = hankeRivi[avain];
      tyhjennysHanke = {
        julkaistu: Boolean(hankeRivi.julkaistu),
        kenttaArvo: raw == null || raw === "" ? null : String(raw),
      };
    }
  }

  let linkkiKenttaArvo: string | null = null;
  let linkkiLahde: {
    luottamus: string;
    merkitty: string;
    lainaus: string | null;
  } | null = null;
  if (linkki?.taulu === "hankkeet" && linkki.rivi_id && linkki.kentta) {
    const { data: hankeRivi } = await supabase
      .from("hankkeet")
      .select("*")
      .eq("id", linkki.rivi_id)
      .maybeSingle();
    if (hankeRivi) {
      const avain = linkki.kentta as keyof typeof hankeRivi;
      const raw = hankeRivi[avain];
      linkkiKenttaArvo = raw == null || raw === "" ? "—" : String(raw);
    }
    const { data: lahdeRivi } = await supabase
      .from("kentta_lahteet")
      .select("luottamus, merkitty, lainaus")
      .eq("taulu", "hankkeet")
      .eq("rivi_id", linkki.rivi_id)
      .eq("kentta", linkki.kentta)
      .eq("lahde_url", linkki.url)
      .maybeSingle();
    if (lahdeRivi) {
      linkkiLahde = {
        luottamus: LUOTTAMUS_NIMET[lahdeRivi.luottamus as keyof typeof LUOTTAMUS_NIMET] ?? lahdeRivi.luottamus,
        merkitty: MERKINTA_NIMET[lahdeRivi.merkitty as keyof typeof MERKINTA_NIMET] ?? lahdeRivi.merkitty,
        lainaus: lahdeRivi.lainaus,
      };
    }
  }

  let ryhtiHanke: {
    id: string;
    nimi: string;
    kunta: string;
    vaihe: string;
    kaavatunnus: string | null;
    kortteli: string | null;
  } | null = null;
  let ryhtiKuntaNimet: string[] = [];
  let ryhtiVaroitusLista: string[] = [];
  let ryhtiHylkaysEhdotus: string | null = null;

  if (ryhti && ehdotus.hanke_id) {
    const { data: hankeRivi } = await supabase
      .from("hankkeet")
      .select("id, nimi, kunta, vaihe, kaavatunnus, kortteli")
      .eq("id", ehdotus.hanke_id)
      .maybeSingle();
    if (hankeRivi) {
      ryhtiHanke = {
        id: hankeRivi.id,
        nimi: hankeRivi.nimi,
        kunta: hankeRivi.kunta,
        vaihe: VAIHE_NIMET[hankeRivi.vaihe as keyof typeof VAIHE_NIMET] ?? hankeRivi.vaihe,
        kaavatunnus: hankeRivi.kaavatunnus,
        kortteli: hankeRivi.kortteli,
      };
    }
    if (ryhti.kunta_tunnukset.length > 0) {
      const { data: kunnat } = await supabase
        .from("kunnat")
        .select("koodi, nimi")
        .eq("voimassa", true);
      ryhtiKuntaNimet = kuntaNimetKoodeista(kunnat ?? [], ryhti.kunta_tunnukset);
    }
    if (ryhtiHanke) {
      ryhtiVaroitusLista = ryhtiVaroitukset({
        hankeKaavatunnus: ryhtiHanke.kaavatunnus,
        ryhtiKaavatunnus: ryhti.kaavatunnus,
        hankeKunta: ryhtiHanke.kunta,
        ryhtiKuntaNimet,
      });
      if (ryhtiVaroitusLista.length > 0) {
        ryhtiHylkaysEhdotus = ryhtiHylkaysPerusteluEhdotus({
          hankeNimi: ryhtiHanke.nimi,
          ryhtiKaavatunnus: ryhti.kaavatunnus,
          ryhtiNimi: ryhti.nimi,
        });
      }
    }
  }

  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-sm">
        <a href="/yllapito" className="text-link underline">
          Ylläpito
        </a>
      </p>
      <h1 className="mt-4 text-3xl font-semibold">Muutosehdotus</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
        <span>{MUUTOSEHDOTUS_TYYPPI_NIMET[ehdotus.tyyppi] ?? ehdotus.tyyppi}</span>
        <span aria-hidden="true">·</span>
        <EhdotusLuokka tyyppi={ehdotus.tyyppi} />
        <span aria-hidden="true">·</span>
        <EhdotusTila tila={ehdotus.tila} />
        <span aria-hidden="true">·</span>
        <span>{ehdotus.ehdottaja_tunniste}</span>
      </p>
      {kasittely ? <p className="mt-2 text-muted">{kasittely}</p> : null}
      {query.julkaistu ? (
        <p className="mt-4">Hanke julkaistiin julkiselle sivustolle.</p>
      ) : null}
      {query.virhe ? (
        <p className="mt-4" role="alert">
          {query.virhe}
        </p>
      ) : null}
      {hankeIdt.length > 0 ? (
        <section className="mt-4" aria-labelledby="koskee-otsikko">
          <h2 id="koskee-otsikko" className="text-lg font-semibold">
            {hankeIdt.length === 1 ? "Hanke" : "Hankkeet"}
          </h2>
          <ul className="mt-2 space-y-3">
            {hankeIdt.map((hankeId) => {
              const hanke = hankeNimella.get(hankeId);
              const piilossa = hanke?.julkaistu === false;
              const duplikaatti = Boolean(hanke?.yhdistetty_kohde_id);
              return (
                <li key={hankeId}>
                  <a href={`/hankkeet/${hankeId}`} className="text-link underline">
                    {hanke?.nimi ?? "Avaa hanke"}
                  </a>
                  {hanke?.kunta ? ` · ${hanke.kunta}` : ""}
                  {hanke?.vaihe ? (
                    <span className="text-muted">
                      {" · "}
                      {VAIHE_NIMET[hanke.vaihe as keyof typeof VAIHE_NIMET] ?? hanke.vaihe}
                    </span>
                  ) : null}
                  {duplikaatti ? (
                    <span className="text-muted"> · poistettu duplikaattina</span>
                  ) : piilossa ? (
                    <span className="text-muted"> · ei julkaistu julkisesti</span>
                  ) : null}
                  {piilossa && !duplikaatti && supabasePalvelinAvainAsetettu() ? (
                    <form action={julkaiseHankeToiminto} className="mt-2">
                      <input type="hidden" name="hanke_id" value={hankeId} />
                      <input type="hidden" name="paluu" value={`/yllapito/${id}`} />
                      <button
                        type="submit"
                        className="rounded border border-foreground px-3 py-1.5 text-sm font-medium"
                      >
                        Julkaise hanke
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {ehdotus.huomautus ? (
        <p className="mt-4">
          <strong>Huomautus:</strong> {ehdotus.huomautus}
        </p>
      ) : null}
      {ehdotus.perustelu ? (
        <p className="mt-4">
          <strong>Käsittelyn perustelu:</strong> {ehdotus.perustelu}
        </p>
      ) : null}

      {ryhti ? (
        <section className="mt-6" aria-labelledby="ryhti-otsikko">
          <h2 id="ryhti-otsikko" className="text-xl font-semibold">
            Ryhti-kaavakohde
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei julkaise
            hanketta. Ryhdistä puuttuva kaava ei ole todiste siitä, ettei
            hanketta ole.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Kokoelma</dt>
              <dd className="mt-1">{ryhti.kokoelma_nimi}</dd>
            </div>
            {ryhti.nimi ? (
              <div className="py-3">
                <dt className="font-medium">Nimi aineistossa</dt>
                <dd className="mt-1">{ryhti.nimi}</dd>
              </div>
            ) : null}
            {ryhti.kaavatunnus ? (
              <div className="py-3">
                <dt className="font-medium">Kaavatunnus</dt>
                <dd className="mt-1">{ryhti.kaavatunnus}</dd>
              </div>
            ) : null}
            {ryhti.kunta_tunnukset.length > 0 ? (
              <div className="py-3">
                <dt className="font-medium">Kuntatunnukset</dt>
                <dd className="mt-1">
                  {ryhtiKuntaNimet.length > 0
                    ? ryhtiKuntaNimet.join(", ")
                    : ryhti.kunta_tunnukset.join(", ")}
                </dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Hakuehto</dt>
              <dd className="mt-1">
                {RYHTI_HAKUEHTO_NIMET[ryhti.hakuehto] ?? ryhti.hakuehto}
              </dd>
            </div>
            {ryhti.muuttunut ? (
              <div className="py-3">
                <dt className="font-medium">Muutos</dt>
                <dd className="mt-1">Kaavakohteen tiedot muuttuivat edellisestä tarkistuksesta.</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Tietue</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
            {ryhti.kuvaus ? (
              <div className="py-3">
                <dt className="font-medium">Kuvaus aineistossa</dt>
                <dd className="mt-1">{ryhti.kuvaus}</dd>
              </div>
            ) : null}
          </dl>
          {ryhtiHanke ? (
            <div className="mt-6 space-y-4 rounded border border-border bg-surface p-4">
              <h3 className="font-medium">Vertailu hankkeeseen</h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Hankkeen kaavatunnus</dt>
                  <dd className="mt-0.5 font-medium">{ryhtiHanke.kaavatunnus ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Ryhti kaavatunnus</dt>
                  <dd className="mt-0.5 font-medium">{ryhti.kaavatunnus ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted">Hankkeen kunta</dt>
                  <dd className="mt-0.5 font-medium">{ryhtiHanke.kunta}</dd>
                </div>
                <div>
                  <dt className="text-muted">Ryhti kunta</dt>
                  <dd className="mt-0.5 font-medium">
                    {ryhtiKuntaNimet.length > 0
                      ? ryhtiKuntaNimet.join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Hankkeen vaihe</dt>
                  <dd className="mt-0.5 font-medium">{ryhtiHanke.vaihe}</dd>
                </div>
                <div>
                  <dt className="text-muted">Kortteli</dt>
                  <dd className="mt-0.5 font-medium">{ryhtiHanke.kortteli ?? "—"}</dd>
                </div>
              </dl>
              {ryhtiVaroitusLista.length > 0 ? (
                <ul className="space-y-1 text-sm" role="alert">
                  {ryhtiVaroitusLista.map((viesti) => (
                    <li key={viesti} className="text-muted">
                      {viesti}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  Kaavatunnus ja kunta täsmäävät. Tarkista silti Ryhti-tietue ennen hyväksyntää.
                </p>
              )}
            </div>
          ) : null}
          {odottaa && ehdotus.tyyppi === "ryhti_havainto" ? (
            <div className="mt-6 space-y-4 rounded border border-border bg-surface p-4">
              <h3 className="font-medium">Toimenpiteet</h3>
              <p className="max-w-prose text-sm text-muted">
                Hyväksyntä merkitsee havainnon nähdyksi. Se ei päivitä hanketta. Jos Ryhti
                tuo uutta tietoa, täydennä kentät erikseen lähteineen.
              </p>
              {ryhtiHanke ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  <li>
                    <a
                      href={`/hankkeet/${ryhtiHanke.id}/paivita?kentta=kaavatunnus`}
                      className="text-link underline"
                    >
                      Päivitä kaavatunnus
                    </a>
                  </li>
                  <li>
                    <a
                      href={`/hankkeet/${ryhtiHanke.id}/paivita?kentta=kortteli`}
                      className="text-link underline"
                    >
                      Päivitä kortteli
                    </a>
                  </li>
                  <li>
                    <a
                      href={`/hankkeet/${ryhtiHanke.id}/paivita?kentta=vaihe`}
                      className="text-link underline"
                    >
                      Päivitä vaihe
                    </a>
                  </li>
                </ul>
              ) : null}
              {ryhtiHylkaysEhdotus ? (
                <form action={hylkaaEhdotusToiminto} className="space-y-2 border-t border-border pt-4">
                  <input type="hidden" name="id" value={ehdotus.id} />
                  <p className="text-sm font-medium">Ei liity hankkeeseen</p>
                  <label htmlFor="ryhti-hylkays-perustelu" className="sr-only">
                    Hylkäyksen perustelu
                  </label>
                  <textarea
                    id="ryhti-hylkays-perustelu"
                    name="perustelu"
                    rows={2}
                    required
                    defaultValue={ryhtiHylkaysEhdotus}
                    className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                  />
                  <button type="submit" className="rounded border border-border px-4 py-2 text-sm">
                    Hylkää (ei liity hankkeeseen)
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {ytj ? (
        <section className="mt-6" aria-labelledby="ytj-otsikko">
          <h2 id="ytj-otsikko" className="text-xl font-semibold">
            YTJ-tiedot
          </h2>
          <p className="mt-2 text-sm text-muted">
            {ytj.ehdota_tunnus
              ? "Hyväksyntä tallentaa Y-tunnuksen organisaatiolle. Lähde on PRH:n YTJ-tietue (CC BY 4.0), ei rajapinnan juurta."
              : "Hyväksyntä merkitsee havainnon käsitellyksi. Se ei päivitä organisaatiota. Lähde: PRH avoin data (YTJ), CC BY 4.0."}
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Y-tunnus</dt>
              <dd className="mt-1">{ytj.y_tunnus}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Nimi rekisterissä</dt>
              <dd className="mt-1">{ytj.rekisterin_nimi}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Toiminimi YTJ:ssä</dt>
              <dd className="mt-1">{ytj.ytj_nimi ?? "ei tietuetta"}</dd>
            </div>
            {ytj.rekisterointi_pvm ? (
              <div className="py-3">
                <dt className="font-medium">Rekisteröintipäivä YTJ:ssä</dt>
                <dd className="mt-1">{ytj.rekisterointi_pvm}</dd>
              </div>
            ) : null}
            {ytj.toimiala ? (
              <div className="py-3">
                <dt className="font-medium">Toimiala YTJ:ssä</dt>
                <dd className="mt-1">{ytj.toimiala}</dd>
              </div>
            ) : null}
            {ytj.kotipaikka ? (
              <div className="py-3">
                <dt className="font-medium">Kotipaikka YTJ:ssä</dt>
                <dd className="mt-1">{ytj.kotipaikka}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Tietue</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {mml ? (
        <section className="mt-6" aria-labelledby="mml-otsikko">
          <h2 id="mml-otsikko" className="text-xl font-semibold">
            MML-geokoodaus
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei päivitä
            hankkeen sijaintia. Lähde: Maanmittauslaitos, CC BY 4.0.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            {mml.nimi ? (
              <div className="py-3">
                <dt className="font-medium">Kohde aineistossa</dt>
                <dd className="mt-1">{mml.nimi}</dd>
              </div>
            ) : null}
            {mml.kunta ? (
              <div className="py-3">
                <dt className="font-medium">Kunta aineistossa</dt>
                <dd className="mt-1">{mml.kunta}</dd>
              </div>
            ) : null}
            {mml.kiinteistotunnus ? (
              <div className="py-3">
                <dt className="font-medium">Kiinteistötunnus aineistossa</dt>
                <dd className="mt-1">{mml.kiinteistotunnus}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Tietue</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {dokumentti ? (
        <section className="mt-6" aria-labelledby="dokumentti-otsikko">
          <h2 id="dokumentti-otsikko" className="text-xl font-semibold">
            Dokumentin muutos
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei muuta
            hankekenttiä. Tiiviste on uutettusta tekstistä, ei PDF-tiedoston
            raakabinääristä.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Otsikko</dt>
              <dd className="mt-1">{dokumentti.otsikko}</dd>
            </div>
            {dokumentti.muoto ? (
              <div className="py-3">
                <dt className="font-medium">Muoto</dt>
                <dd className="mt-1">{dokumentti.muoto}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Merkkimäärä</dt>
              <dd className="mt-1">{dokumentti.merkkimaara}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Edellinen tiiviste</dt>
              <dd className="mt-1 break-all font-mono text-sm">
                {dokumentti.vanha_tiiviste ?? "ei aiempaa"}
              </dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Uusi tiiviste</dt>
              <dd className="mt-1 break-all font-mono text-sm">
                {dokumentti.uusi_tiiviste}
              </dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Osoite</dt>
              <dd className="mt-1">
                <a
                  href={ehdotus.lahde_url ?? "#"}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {ehdotus.lahde_url}
                </a>
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {ristiriita ? (
        <section className="mt-6" aria-labelledby="ristiriita-otsikko">
          <h2 id="ristiriita-otsikko" className="text-xl font-semibold">
            Ristiriitahavainto
          </h2>
          <p className="mt-2 text-sm text-muted">
            Hyväksyntä merkitsee havainnon käsitellyksi. Se ei muuta
            hankekenttiä eikä päättele syytä.
          </p>
          {ristiriita.ei_uudelleen ? (
            <p className="mt-2 text-sm">Sama havainto ei nouse uudelleen.</p>
          ) : null}
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Sääntö</dt>
              <dd className="mt-1">
                {RISTIRIITA_SAANTO_NIMET[ristiriita.saanto] ?? ristiriita.saanto}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {linkki ? (
        <section className="mt-6" aria-labelledby="linkki-otsikko">
          <h2 id="linkki-otsikko" className="text-xl font-semibold">
            Linkkitarkistus
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted">
            Havainto ei poista julkaistua arvoa. Korjaa lähde-URL, jos tiedosto on siirtynyt.
            Merkitse käsitellyksi vain, jos linkki toimii selaimessa tai arvo on jo korjattu
            muualla.
          </p>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">Kenttä</dt>
              <dd className="mt-1">
                {HANKE_KENTTA_NIMET[linkki.kentta] ?? linkki.kentta}
                {linkkiKenttaArvo != null ? (
                  <span className="text-muted"> · julkaistu arvo: {linkkiKenttaArvo}</span>
                ) : null}
              </dd>
            </div>
            {linkkiLahde ? (
              <div className="py-3">
                <dt className="font-medium">Lähteen tila</dt>
                <dd className="mt-1 text-sm text-muted">
                  {linkkiLahde.luottamus} · {linkkiLahde.merkitty}
                </dd>
                {linkkiLahde.lainaus ? (
                  <dd className="mt-1 text-sm">{linkkiLahde.lainaus}</dd>
                ) : null}
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">Osoite</dt>
              <dd className="mt-1">
                <a href={linkki.url} className="text-link underline break-all" rel="noopener noreferrer">
                  {linkki.url}
                </a>
              </dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">HTTP-tila</dt>
              <dd className="mt-1">{linkki.http_tila ?? "ei vastausta"}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">Vaste</dt>
              <dd className="mt-1">{linkki.vaste_ms} ms</dd>
            </div>
            {linkki.virhe ? (
              <div className="py-3">
                <dt className="font-medium">Virhe</dt>
                <dd className="mt-1">{linkki.virhe}</dd>
              </div>
            ) : null}
          </dl>
          {linkki.http_tila === 401 ||
          linkki.http_tila === 403 ||
          linkki.http_tila === 429 ||
          linkki.http_tila === 503 ||
          linkki.http_tila === 502 ||
          linkki.http_tila === 504 ? (
            <p className="mt-3 text-sm text-muted">
              Tämä tilakoodi on kielletty tai tilapäinen vastaus, ei todiste
              siitä että osoite olisi kadonnut. Jos osoite avautuu selaimessa,
              merkitse havainto käsitellyksi.
            </p>
          ) : null}
          {odottaa && ehdotus.tyyppi === "linkki_rikki" ? (
            <div className="mt-6 space-y-6 rounded border border-border bg-surface p-4">
              <div>
                <h3 className="font-medium">Korjaa lähde-URL</h3>
                <p className="mt-1 max-w-prose text-sm text-muted">
                  Etsi tiedoston uusi osoite (esim. kunnan sivuilta) ja tallenna. Julkaistu arvo
                  pysyy ennallaan; vain lähde päivittyy.
                </p>
                {supabasePalvelinAvainAsetettu() ? (
                  <form action={korjaaLinkkiLahdeToiminto} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={ehdotus.id} />
                    <label htmlFor="uusi_lahde_url" className="block text-sm font-medium">
                      Uusi lähde-URL
                    </label>
                    <input
                      id="uusi_lahde_url"
                      name="uusi_lahde_url"
                      type="url"
                      required
                      placeholder="https://…"
                      className="w-full rounded border border-border bg-background px-2 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
                    >
                      Korjaa URL ja merkitse käsitellyksi
                    </button>
                  </form>
                ) : null}
              </div>
              {linkki.taulu === "hankkeet" && hankeIdt[0] ? (
                <div className="space-y-2 text-sm">
                  <p className="font-medium">Muut toimenpiteet</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted">
                    <li>
                      <a
                        href={`/hankkeet/${hankeIdt[0]}/paivita?kentta=${encodeURIComponent(linkki.kentta)}`}
                        className="text-link underline"
                      >
                        Päivitä kentän arvo ja lähde
                      </a>
                    </li>
                    <li>
                      <a
                        href={`/hankkeet/${hankeIdt[0]}/paivita?kentta=${encodeURIComponent(linkki.kentta)}`}
                        className="text-link underline"
                      >
                        Poista virheellinen arvo
                      </a>
                      {" "}
                      (sivun alaosassa «Poista virheellinen arvo»)
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {Object.keys(sisalto.kentat ?? {}).length > 0 ? (
        <dl className="mt-6 divide-y divide-border border-y border-border">
        {Object.entries(sisalto.kentat ?? {}).map(([kentta, tieto]) => (
          <div key={kentta} className="py-3">
            <dt className="font-medium">
              {kentta === "toimija_nimi"
                ? "Hankkeesta vastaava"
                : (HANKE_KENTTA_NIMET[kentta] ?? kentta)}
            </dt>
            <dd className="mt-1">
              {tieto.arvo}
              {tieto.luottamus ? (
                <span className="text-sm text-muted">
                  {" "}
                  · {LUOTTAMUS_NIMET[tieto.luottamus]}
                </span>
              ) : null}
              <p className="mt-1 text-sm">
                <a href={tieto.lahde_url} className="text-link underline" rel="noopener noreferrer">
                  {tieto.lahde_url}
                </a>
                {tieto.lahde_sivu ? ` (s. ${tieto.lahde_sivu})` : ""}
              </p>
              {tieto.lainaus ? <blockquote className="mt-2 border-l-2 pl-3">{tieto.lainaus}</blockquote> : null}
            </dd>
          </div>
        ))}
        </dl>
      ) : null}

      {sisalto.tarkistus ? (
        <section className="mt-6" aria-labelledby="tarkistus-otsikko">
          <h2 id="tarkistus-otsikko" className="text-xl font-semibold">
            Kenttä tarkistettu ilman lähdettä
          </h2>
          <p className="mt-2 leading-relaxed">
            {HANKE_KENTTA_NIMET[sisalto.tarkistus.kentta] ?? sisalto.tarkistus.kentta}
            {sisalto.tarkistus.tulos === "ei_julkista_lahdetta"
              ? ": julkista lähdettä ei ole."
              : ""}
          </p>
          {sisalto.tarkistus.huomautus ? (
            <p className="mt-2 text-sm text-muted">{sisalto.tarkistus.huomautus}</p>
          ) : null}
          {odottaa && ehdotus.tyyppi === "kentta_tarkistus" ? (
            <p className="mt-3 text-sm text-muted" role="note">
              Hyväksyntä onnistuu vain, jos kenttä on jo tyhjä rekisterissä. Jos kentässä
              on virheellinen arvo, hylkää tämä ehdotus ja käytä{" "}
              <strong className="font-medium">kentta_tyhjennys</strong> -tyyppiä (Grok) tai
              hankesivun «Poista virheellinen arvo» -lomaketta.
            </p>
          ) : null}
        </section>
      ) : null}

      {tyhjennysNakyma ? (
        <section className="mt-6" aria-labelledby="tyhjennys-otsikko">
          <h2 id="tyhjennys-otsikko" className="text-xl font-semibold">
            Kentän tyhjennys
          </h2>
          {tyhjennysNakyma.korjattuMuodosta ? (
            <p className="mt-2 text-sm text-muted" role="status">
              Ehdotus on virheellisessä muodossa (kentät ilman tyhjennys-lohkoa). Hyväksyntä
              korjaa muodon automaattisesti.
            </p>
          ) : null}
          {tyhjennysHanke && !tyhjennysHanke.julkaistu ? (
            <p className="mt-2 text-sm text-muted" role="status">
              Hanke ei ole vielä julkaistu julkisesti. Tyhjennys poistaa arvon tietokannasta ennen
              julkaisua.
            </p>
          ) : null}
          {tyhjennysHanke?.kenttaArvo ? (
            <p className="mt-2 text-sm">
              <strong className="font-medium">Nykyinen arvo:</strong> {tyhjennysHanke.kenttaArvo}
            </p>
          ) : null}
          <p className="mt-2 leading-relaxed">
            {HANKE_KENTTA_NIMET[tyhjennysNakyma.tyhjennys.kentta] ?? tyhjennysNakyma.tyhjennys.kentta}
            {" — "}
            poistetaan julkaistu arvo ja lähteet.
          </p>
          <p className="mt-2 text-sm">
            <strong className="font-medium">Perustelu:</strong> {tyhjennysNakyma.tyhjennys.perustelu}
          </p>
          {tyhjennysNakyma.tyhjennys.lahde_url ? (
            <p className="mt-2 text-sm">
              <a
                href={tyhjennysNakyma.tyhjennys.lahde_url}
                className="text-link underline"
                rel="noopener noreferrer"
              >
                {tyhjennysNakyma.tyhjennys.lahde_url}
              </a>
            </p>
          ) : null}
          {tyhjennysNakyma.tyhjennys.lainaus ? (
            <blockquote className="mt-2 border-l-2 pl-3 text-sm">
              {tyhjennysNakyma.tyhjennys.lainaus}
            </blockquote>
          ) : null}
          {tyhjennysNakyma.tyhjennys.merkitse_ei_lahdetta ? (
            <p className="mt-2 text-sm text-muted">
              Hyväksynnän jälkeen merkitään: julkista lähdettä ei ole.
            </p>
          ) : null}
        </section>
      ) : null}

      {sisalto.paatos ? (
        <section className="mt-6" aria-labelledby="paatos-otsikko">
          <h2 id="paatos-otsikko" className="text-xl font-semibold">
            Viranomaispäätös
          </h2>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">{PAATOS_KENTTA_NIMET.kuvaus}</dt>
              <dd className="mt-1">{sisalto.paatos.kuvaus}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">{PAATOS_KENTTA_NIMET.pvm}</dt>
              <dd className="mt-1">{sisalto.paatos.pvm}</dd>
            </div>
            <div className="py-3">
              <dt className="font-medium">{PAATOS_KENTTA_NIMET.paattava_organisaatio_id}</dt>
              <dd className="mt-1">
                {sisalto.paatos.paattava_organisaatio_nimi ??
                  sisalto.paatos.paattava_organisaatio_id ??
                  "—"}
              </dd>
            </div>
          </dl>
          {paatosLahteetPuuttuu ? (
            <p className="mt-3 text-sm text-muted" role="alert">
              Ehdotuksessa puuttuu lähderivit (lahteet). Täydennä JSON ennen hyväksyntää tai hylkää.
            </p>
          ) : null}
          {paatosLahteet.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {paatosLahteet.map((lahde) => (
                <li key={lahde.kentta} className="rounded border border-border px-3 py-2">
                  <p className="font-medium">
                    {PAATOS_KENTTA_NIMET[lahde.kentta] ?? lahde.kentta}
                  </p>
                  <p className="mt-1">
                    <a href={lahde.lahde_url} className="text-link underline" rel="noopener noreferrer">
                      {lahde.lahde_url}
                    </a>
                    {lahde.lahde_sivu ? ` (s. ${lahde.lahde_sivu})` : ""}
                  </p>
                  <p className="mt-1 text-muted">{LUOTTAMUS_NIMET[lahde.luottamus]}</p>
                  {lahde.lainaus ? (
                    <blockquote className="mt-1 border-l-2 pl-3">{lahde.lainaus}</blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {sisalto.maaraaja ? (
        <section className="mt-6" aria-labelledby="maaraaja-otsikko">
          <h2 id="maaraaja-otsikko" className="text-xl font-semibold">
            Määräaika
          </h2>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="font-medium">{MAARAAJA_KENTTA_NIMET.tyyppi}</dt>
              <dd className="mt-1">
                {MAARAAJA_NIMET[
                  sisalto.maaraaja.tyyppi as keyof typeof MAARAAJA_NIMET
                ] ?? sisalto.maaraaja.tyyppi}
              </dd>
            </div>
            {sisalto.maaraaja.alkaa_pvm ? (
              <div className="py-3">
                <dt className="font-medium">{MAARAAJA_KENTTA_NIMET.alkaa_pvm}</dt>
                <dd className="mt-1">{sisalto.maaraaja.alkaa_pvm}</dd>
              </div>
            ) : null}
            <div className="py-3">
              <dt className="font-medium">{MAARAAJA_KENTTA_NIMET.paattyy_pvm}</dt>
              <dd className="mt-1">{sisalto.maaraaja.paattyy_pvm}</dd>
            </div>
            {sisalto.maaraaja.menettely_id ? (
              <div className="py-3">
                <dt className="font-medium">Menettely</dt>
                <dd className="mt-1 font-mono text-sm">{sisalto.maaraaja.menettely_id}</dd>
              </div>
            ) : null}
          </dl>
          {maaraajaLahteetPuuttuu ? (
            <p className="mt-3 text-sm text-muted" role="alert">
              Ehdotuksessa puuttuu lähderivit (lahteet). Täydennä JSON ennen hyväksyntää tai hylkää.
            </p>
          ) : null}
          {maaraajaLahteet.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {maaraajaLahteet.map((lahde) => (
                <li key={lahde.kentta} className="rounded border border-border px-3 py-2">
                  <p className="font-medium">
                    {MAARAAJA_KENTTA_NIMET[lahde.kentta] ?? lahde.kentta}
                  </p>
                  <p className="mt-1">
                    <a href={lahde.lahde_url} className="text-link underline" rel="noopener noreferrer">
                      {lahde.lahde_url}
                    </a>
                    {lahde.lahde_sivu ? ` (s. ${lahde.lahde_sivu})` : ""}
                  </p>
                  <p className="mt-1 text-muted">{LUOTTAMUS_NIMET[lahde.luottamus]}</p>
                  {lahde.lainaus ? (
                    <blockquote className="mt-1 border-l-2 pl-3">{lahde.lainaus}</blockquote>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {sisalto.kuvat && sisalto.kuvat.length > 0 ? (
        <section className="mt-8" aria-labelledby="kuvat-otsikko">
          <h2 id="kuvat-otsikko" className="text-xl font-semibold">
            Valokuvat
          </h2>
          <ul className="mt-4 space-y-6">
            {sisalto.kuvat.map((kuva, indeksi) => (
              <li key={`${kuva.kuva_url}-${indeksi}`}>
                <figure className="overflow-hidden rounded border border-border bg-surface">
                  <img
                    src={kuva.kuva_url}
                    alt={kuva.kuvateksti}
                    className="h-64 w-full object-cover"
                  />
                  <figcaption className="space-y-1 p-3 text-sm">
                    <p>{kuva.kuvateksti}</p>
                    <p className="text-muted">Valokuva: {kuva.kuvaaja}</p>
                    <p>
                      <a
                        href={kuva.lahde_url}
                        className="text-link underline"
                        rel="noopener noreferrer"
                      >
                        {kuva.lahde_url}
                      </a>
                    </p>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sisalto.vaihtoehdot && Object.keys(sisalto.vaihtoehdot).length > 0 ? (
        <section className="mt-8" aria-labelledby="vaihtoehdot-otsikko">
          <h2 id="vaihtoehdot-otsikko" className="text-xl font-semibold">
            Vaihtoehdot
          </h2>
          <p className="mt-2 text-sm text-muted">
            Luvut kirjoitetaan vaihtoehtoriveille, ei hankkeen yhteisiin
            teho- tai sähkökenttiin.
          </p>
          {Object.entries(sisalto.vaihtoehdot).map(([tunnus, kentat]) => (
            <div key={tunnus} className="mt-4">
              <h3 className="font-medium">{tunnus}</h3>
              <dl className="mt-2 divide-y divide-border border-y border-border">
                {Object.entries(kentat).map(([kentta, tieto]) => (
                  <div key={kentta} className="py-3">
                    <dt className="font-medium">{HANKE_KENTTA_NIMET[kentta] ?? kentta}</dt>
                    <dd className="mt-1">
                      {tieto.arvo}
                      {tieto.luottamus ? (
                        <span className="text-sm text-muted"> · {tieto.luottamus}</span>
                      ) : null}
                      <p className="mt-1 text-sm">
                        <a
                          href={tieto.lahde_url}
                          className="text-link underline"
                          rel="noopener noreferrer"
                        >
                          {tieto.lahde_url}
                        </a>
                        {tieto.lahde_sivu ? ` (s. ${tieto.lahde_sivu})` : ""}
                      </p>
                      {tieto.lainaus ? (
                        <blockquote className="mt-2 border-l-2 pl-3">{tieto.lainaus}</blockquote>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ) : null}

      {odottaa && !supabasePalvelinAvainAsetettu() ? (
        <p className="mt-6 text-sm">
          Hyväksyntä vaatii palvelinavaimen <code>SUPABASE_SERVICE_ROLE_KEY</code>. Lisää se
          .env.local-tiedostoon ja Verceliin. Älä liitä avainta chattiin.
        </p>
      ) : null}

      {odottaa ? (
        <div className="mt-8 flex flex-col gap-6">
          <form action={hyvaksyEhdotusToiminto} className="space-y-3">
            <input type="hidden" name="id" value={ehdotus.id} />
            {ristiriita ? (
              <div className="space-y-3">
                <p className="max-w-prose text-sm text-muted">
                  Käsittely merkitsee, ettei sama havainto nouse uudelleen.
                  Kirjaa miksi. Jos kyse on samasta kokonaisuudesta, valitse
                  säilytettävä hanke ja yhdistä.
                </p>
                {hankeIdt.length === 2 ? (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">
                      Yhdistä samaan hankkeeseen (valitse säilytettävä)
                    </legend>
                    <p className="max-w-prose text-sm text-muted">
                      Siirrettävän puuttuvat tiedot ja lähteet täydennetään
                      säilytettävään. Toinen kortti poistuu julkisesta listasta;
                      vanha osoite ohjaa uuteen. Rivejä ei poisteta.
                    </p>
                    {hankeIdt.map((hankeId) => {
                      const hanke = hankeNimella.get(hankeId);
                      return (
                        <div key={hankeId} className="flex items-start gap-2">
                          <input
                            id={`sailytettava-${hankeId}`}
                            type="radio"
                            name="sailytettava_hanke_id"
                            value={hankeId}
                            className="mt-1"
                          />
                          <label htmlFor={`sailytettava-${hankeId}`} className="text-sm">
                            {hanke?.nimi ?? "Hanke"}
                            {hanke?.kunta ? ` · ${hanke.kunta}` : ""}
                          </label>
                        </div>
                      );
                    })}
                  </fieldset>
                ) : null}
                <label htmlFor="ei-uudelleen-perustelu" className="block text-sm font-medium">
                  Miksi havainto ei nouse uudelleen
                </label>
                <textarea
                  id="ei-uudelleen-perustelu"
                  name="ei_uudelleen_perustelu"
                  rows={3}
                  required
                  minLength={12}
                  className="w-full rounded border border-border bg-surface px-2 py-2"
                />
              </div>
            ) : null}
            {ristiriita && hankeIdt.length === 2 ? (
              <button
                type="submit"
                name="toiminto"
                value="yhdista"
                className="rounded border border-border px-4 py-2 text-sm"
              >
                Yhdistä valittuun hankkeeseen
              </button>
            ) : null}
            <button
              type="submit"
              name="toiminto"
              value="kasittele"
              className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {hyvaksyTeksti}
            </button>
          </form>
          <form action={hylkaaEhdotusToiminto} className="space-y-2">
            <input type="hidden" name="id" value={ehdotus.id} />
            {ristiriita ? (
              <p className="max-w-prose text-sm text-muted">
                Hylkäys poistaa rivin jonosta, mutta sama havainto voi nousta
                seuraavassa ajossa.
              </p>
            ) : null}
            <label htmlFor="perustelu" className="text-sm font-medium">
              Hylkäyksen perustelu
            </label>
            <textarea
              id="perustelu"
              name="perustelu"
              rows={3}
              className="w-full rounded border border-border bg-surface px-2 py-2"
            />
            <button type="submit" className="rounded border border-border px-4 py-2 text-sm">
              Hylkää
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
