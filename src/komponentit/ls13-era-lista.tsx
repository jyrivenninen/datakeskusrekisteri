"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  kasitteleLs13EraEiTueToiminto,
  kasitteleLs13EraTukeeToiminto,
} from "@/app/toiminnot";
import { HANKE_KENTTA_NIMET } from "@/lib/naytto";
import type { Ls13EraRivi } from "@/lib/ls13-era-lapikaynti";

export function Ls13EraLista({ rivit }: { rivit: Ls13EraRivi[] }) {
  const router = useRouter();
  const [jono, setJono] = useState(rivit);
  const [aktiivinen, setAktiivinen] = useState(0);
  const [tallentaa, setTallentaa] = useState(false);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [huomautus, setHuomautus] = useState("");
  const [peruutusAuki, setPeruutusAuki] = useState(false);

  useEffect(() => {
    setJono(rivit);
    setAktiivinen(0);
    setPeruutusAuki(false);
    setHuomautus("");
  }, [rivit]);

  const rivi = jono[aktiivinen] ?? null;

  const merkitseTukee = useCallback(async () => {
    if (!rivi || tallentaa) return;
    setTallentaa(true);
    setVirhe(null);
    const fd = new FormData();
    fd.set("lahde_id", rivi.lahde_id);
    fd.set("hanke_id", rivi.hanke_id);
    fd.set("kentta", rivi.kentta);
    fd.set("lahde_url", rivi.lahde_url);
    try {
      await kasitteleLs13EraTukeeToiminto(fd);
      const seuraavat = jono.filter((r) => r.lahde_id !== rivi.lahde_id);
      setJono(seuraavat);
      setAktiivinen((i) => Math.min(i, Math.max(0, seuraavat.length - 1)));
      router.refresh();
    } catch (syy) {
      setVirhe(syy instanceof Error ? syy.message : "Tallennus epäonnistui.");
    } finally {
      setTallentaa(false);
    }
  }, [rivi, tallentaa, jono, router]);

  const merkitseEiTue = useCallback(async () => {
    if (!rivi || tallentaa) return;
    if (huomautus.trim().length < 12) {
      setVirhe("Kirjaa miksi kuittaus perutaan (vähintään 12 merkkiä).");
      return;
    }
    setTallentaa(true);
    setVirhe(null);
    const fd = new FormData();
    fd.set("lahde_id", rivi.lahde_id);
    fd.set("hanke_id", rivi.hanke_id);
    fd.set("huomautus", huomautus.trim());
    try {
      await kasitteleLs13EraEiTueToiminto(fd);
      const seuraavat = jono.filter((r) => r.lahde_id !== rivi.lahde_id);
      setJono(seuraavat);
      setAktiivinen((i) => Math.min(i, Math.max(0, seuraavat.length - 1)));
      setPeruutusAuki(false);
      setHuomautus("");
      router.refresh();
    } catch (syy) {
      setVirhe(syy instanceof Error ? syy.message : "Peruutus epäonnistui.");
    } finally {
      setTallentaa(false);
    }
  }, [rivi, tallentaa, huomautus, jono, router]);

  if (jono.length === 0) {
    return <p className="mt-4">Jonossa ei ole käsittelemättömiä eräkuittauksia.</p>;
  }
  if (!rivi) return null;

  const kenttaNimi = HANKE_KENTTA_NIMET[rivi.kentta] ?? rivi.kentta;
  const kone = rivi.kone_tarkistus;

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Rivi {aktiivinen + 1} / {jono.length}
        {kone.tulos === "ei_tue" ? (
          <span className="ml-2 text-amber-800">· kone: ei tue</span>
        ) : kone.tulos === "ok" ? (
          <span className="ml-2">· kone: ok</span>
        ) : (
          <span className="ml-2">· kone: vaihe → ihminen</span>
        )}
      </p>

      <article className="mt-4 border-y border-border py-4">
        <h2 className="text-xl font-semibold">
          <a
            href={`/hankkeet/${rivi.hanke_id}`}
            className="text-link underline"
          >
            {rivi.hanke_nimi}
          </a>
        </h2>
        <p className="mt-1 text-sm text-muted">
          {kenttaNimi}
          {rivi.arvo != null ? (
            <>
              {" · arvo "}
              <span className="text-foreground">{rivi.arvo}</span>
            </>
          ) : null}
        </p>

        <p className="mt-4 text-sm leading-relaxed">
          <span className="font-medium">Lainaus: </span>
          {rivi.lainaus?.trim() || (
            <span className="text-muted">ei lainausta</span>
          )}
        </p>
        <p className="mt-1 text-sm text-muted">
          sivu {rivi.lahde_sivu ?? "—"} ·{" "}
          <a
            href={rivi.lahde_url}
            className="text-link underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            lähde
          </a>
          {" · "}
          {rivi.ehdottaja_tunniste}
        </p>
        {kone.tulos === "ei_tue" ? (
          <p className="mt-2 text-sm text-amber-900">{kone.syy}</p>
        ) : null}

        {virhe ? <p className="mt-3 text-sm text-red-700">{virhe}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={tallentaa}
            className="border border-border bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
            onClick={() => void merkitseTukee()}
          >
            Tukee (jää ihmisen vahvistamaksi)
          </button>
          <button
            type="button"
            disabled={tallentaa}
            className="border border-border px-3 py-2 text-sm disabled:opacity-50"
            onClick={() => setPeruutusAuki((v) => !v)}
          >
            Ei tue (tila=ei_tue)
          </button>
        </div>

        {peruutusAuki ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm" htmlFor="ls13-peruutus-huom">
              Miksi kuittaus perutaan?
            </label>
            <textarea
              id="ls13-peruutus-huom"
              className="w-full border border-border bg-background p-2 text-sm"
              rows={3}
              value={huomautus}
              onChange={(e) => setHuomautus(e.target.value)}
            />
            <button
              type="button"
              disabled={tallentaa}
              className="border border-border px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => void merkitseEiTue()}
            >
              Peruuta kuittaus
            </button>
          </div>
        ) : null}
      </article>

      <div className="mt-3 flex gap-2 text-sm">
        <button
          type="button"
          className="text-link underline disabled:opacity-40"
          disabled={aktiivinen <= 0}
          onClick={() => setAktiivinen((i) => Math.max(0, i - 1))}
        >
          Edellinen
        </button>
        <button
          type="button"
          className="text-link underline disabled:opacity-40"
          disabled={aktiivinen >= jono.length - 1}
          onClick={() =>
            setAktiivinen((i) => Math.min(jono.length - 1, i + 1))
          }
        >
          Seuraava
        </button>
      </div>
    </div>
  );
}
