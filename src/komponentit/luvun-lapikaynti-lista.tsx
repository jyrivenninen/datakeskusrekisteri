"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { kasitteleLuvunRistiriitaToiminto } from "@/app/toiminnot";
import { HANKE_KENTTA_NIMET, muotoileLuku } from "@/lib/naytto";
import type { LuvunRistiriitaRivi } from "@/lib/luvun-ristiriita";

type Paatos = "eri_asia" | "ristiriitainen" | "korvattu";

export function LuvunLapikayntiLista({ rivit }: { rivit: LuvunRistiriitaRivi[] }) {
  const router = useRouter();
  const [jono, setJono] = useState(rivit);
  const [aktiivinen, setAktiivinen] = useState(0);
  const [tallentaa, setTallentaa] = useState(false);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [korvattavaId, setKorvattavaId] = useState<string>("");
  const [huomautus, setHuomautus] = useState("");

  useEffect(() => {
    setJono(rivit);
    setAktiivinen(0);
  }, [rivit]);

  const rivi = jono[aktiivinen] ?? null;

  useEffect(() => {
    if (!rivi) {
      setKorvattavaId("");
      return;
    }
    // Oletus: merkitse korvatuksi se lähde, jonka luku ei ole nykyinen arvo
    const eri = rivi.lahteet.find((l) => l.luku !== rivi.nykyinen_arvo);
    setKorvattavaId(eri?.lahde_id ?? rivi.lahteet[0]?.lahde_id ?? "");
    setHuomautus("");
  }, [rivi]);

  const tallenna = useCallback(
    async (paatos: Paatos) => {
      if (!rivi || tallentaa) return;
      if (paatos === "korvattu" && !korvattavaId) {
        setVirhe("Valitse korvattava lähde.");
        return;
      }
      setTallentaa(true);
      setVirhe(null);
      const fd = new FormData();
      fd.set("taulu", rivi.taulu);
      fd.set("rivi_id", rivi.rivi_id);
      fd.set("kentta", rivi.kentta);
      fd.set("paatos", paatos);
      fd.set("huomautus", huomautus);
      if (paatos === "korvattu") fd.set("korvattava_lahde_id", korvattavaId);
      try {
        await kasitteleLuvunRistiriitaToiminto(fd);
        const seuraavat = jono.filter((r) => r.avain !== rivi.avain);
        setJono(seuraavat);
        setAktiivinen((i) => Math.min(i, Math.max(0, seuraavat.length - 1)));
        router.refresh();
      } catch (syy) {
        setVirhe(syy instanceof Error ? syy.message : "Tallennus epäonnistui.");
      } finally {
        setTallentaa(false);
      }
    },
    [rivi, tallentaa, korvattavaId, huomautus, jono, router],
  );

  if (jono.length === 0) {
    return <p className="mt-4">Jonossa ei ole käsittelemättömiä rivejä.</p>;
  }

  if (!rivi) return null;

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Rivi {aktiivinen + 1} / {jono.length}
        {rivi.kentta === "pinta_ala_ha" ? " · pinta-ala ensin" : ""}
      </p>

      <article className="mt-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-xl font-semibold">
          <a href={`/hankkeet/${rivi.rivi_id}`} className="text-link underline">
            {rivi.hanke_nimi}
          </a>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {rivi.hanke_kunta} · {HANKE_KENTTA_NIMET[rivi.kentta] ?? rivi.kentta} ·
          nykyinen arvo{" "}
          {rivi.nykyinen_arvo != null ? muotoileLuku(rivi.nykyinen_arvo) : "—"}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rivi.lahteet.map((lahde) => (
            <div
              key={lahde.lahde_id}
              className="rounded-lg border border-border bg-background p-3"
            >
              <p className="text-sm font-semibold tabular-nums">{lahde.luku_naytto}</p>
              <p className="mt-2 text-sm leading-relaxed">{lahde.lainaus}</p>
              <p className="mt-2 break-all text-xs text-muted">
                <a
                  href={lahde.lahde_url}
                  className="text-link underline"
                  rel="noopener noreferrer"
                >
                  {lahde.lahde_url}
                </a>
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label htmlFor="luvun-huomautus" className="text-sm font-medium">
            Huomautus (valinnainen)
          </label>
          <textarea
            id="luvun-huomautus"
            value={huomautus}
            onChange={(e) => setHuomautus(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium">
            Korvattava lähde (vain jos merkitset vanhentuneeksi)
          </legend>
          <ul className="mt-2 space-y-2">
            {rivi.lahteet.map((lahde) => (
              <li key={lahde.lahde_id}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="korvattava"
                    value={lahde.lahde_id}
                    checked={korvattavaId === lahde.lahde_id}
                    onChange={() => setKorvattavaId(lahde.lahde_id)}
                    className="mt-1"
                  />
                  <span>
                    {lahde.luku_naytto}
                    {rivi.nykyinen_arvo === lahde.luku ? " (nykyinen arvo)" : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        {virhe ? <p className="mt-3 text-sm text-red-700">{virhe}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={tallentaa}
            onClick={() => tallenna("eri_asia")}
            className="min-h-11 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Lähteet tarkoittavat eri asiaa (ei ristiriita)
          </button>
          <button
            type="button"
            disabled={tallentaa}
            onClick={() => tallenna("ristiriitainen")}
            className="min-h-11 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Lähteet ovat ristiriidassa (merkitse ristiriitainen)
          </button>
          <button
            type="button"
            disabled={tallentaa}
            onClick={() => tallenna("korvattu")}
            className="min-h-11 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            Toinen lähde on vanhentunut (merkitse korvattu)
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">
          «Eri asiaa» vain kirjaa päätöksen (esim. kaava-alue vs tontti). «Ristiriita»
          merkitsee kaikki voimassa olevat lähteet ristiriitaisiksi. «Vanhentunut»
          merkitsee valitun lähteen korvatuksi säilytettävän lähteen dokumentilla.
        </p>
      </article>

      <div className="mt-4 flex gap-3 text-sm">
        <button
          type="button"
          disabled={aktiivinen === 0}
          onClick={() => setAktiivinen((i) => Math.max(0, i - 1))}
          className="text-link underline disabled:text-muted disabled:no-underline"
        >
          Edellinen
        </button>
        <button
          type="button"
          disabled={aktiivinen >= jono.length - 1}
          onClick={() => setAktiivinen((i) => Math.min(jono.length - 1, i + 1))}
          className="text-link underline disabled:text-muted disabled:no-underline"
        >
          Seuraava
        </button>
      </div>
    </div>
  );
}
