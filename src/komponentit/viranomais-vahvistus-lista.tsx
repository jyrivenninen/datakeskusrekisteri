"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  asetaLainauksenLuonneToiminto,
  kasitteleViranomaisVahvistusEiTueToiminto,
  kasitteleViranomaisVahvistusTukeeToiminto,
} from "@/app/toiminnot";
import {
  LAINAUKSEN_LUONNE_NIMET,
  LAINAUKSEN_LUONTEET,
  luokitteleLainauksenLuonne,
} from "@/lib/lainauksen-luonne";
import { HANKE_KENTTA_NIMET } from "@/lib/naytto";
import type { ViranomaisVahvistusRivi } from "@/lib/viranomais-vahvistus-lapikaynti";

const LUONNE_KENTAT = new Set(["vaihe", "kuvaus"]);

export function ViranomaisVahvistusLista({
  rivit,
  ryhma,
  vainLuku = false,
}: {
  rivit: ViranomaisVahvistusRivi[];
  ryhma: string;
  /** Otos: ei tallenna. */
  vainLuku?: boolean;
}) {
  const router = useRouter();
  const [jono, setJono] = useState(rivit);
  const [aktiivinen, setAktiivinen] = useState(0);
  const [tallentaa, setTallentaa] = useState(false);
  const [virhe, setVirhe] = useState<string | null>(null);
  const [poikkeamaAuki, setPoikkeamaAuki] = useState(false);
  const [huomautus, setHuomautus] = useState("");
  const [arviot, setArviot] = useState<Record<string, "tukee" | "ei_tue">>({});
  const [luonneValinta, setLuonneValinta] = useState<Record<string, string>>({});

  useEffect(() => {
    setJono(rivit);
    setAktiivinen(0);
    setPoikkeamaAuki(false);
    setHuomautus("");
    setLuonneValinta({});
  }, [rivit]);

  const rivi = jono[aktiivinen] ?? null;

  const merkitseTukee = useCallback(async () => {
    if (!rivi || tallentaa || vainLuku) return;
    setTallentaa(true);
    setVirhe(null);
    const fd = new FormData();
    fd.set("ryhma", ryhma);
    fd.set("taulu", rivi.taulu);
    fd.set("rivi_id", rivi.rivi_id);
    fd.set("kentta", rivi.kentta);
    fd.set("lahde_idt", rivi.lahteet.map((l) => l.lahde_id).join(","));
    try {
      await kasitteleViranomaisVahvistusTukeeToiminto(fd);
      const seuraavat = jono.filter((r) => r.avain !== rivi.avain);
      setJono(seuraavat);
      setAktiivinen((i) => Math.min(i, Math.max(0, seuraavat.length - 1)));
      router.refresh();
    } catch (syy) {
      setVirhe(syy instanceof Error ? syy.message : "Tallennus epäonnistui.");
    } finally {
      setTallentaa(false);
    }
  }, [rivi, tallentaa, vainLuku, ryhma, jono, router]);

  const merkitseEiTue = useCallback(async () => {
    if (!rivi || tallentaa || vainLuku) return;
    if (huomautus.trim().length < 12) {
      setVirhe("Kirjaa miksi lähde ei tue arvoa (vähintään 12 merkkiä).");
      return;
    }
    setTallentaa(true);
    setVirhe(null);
    const fd = new FormData();
    fd.set("ryhma", ryhma);
    fd.set("taulu", rivi.taulu);
    fd.set("rivi_id", rivi.rivi_id);
    fd.set("kentta", rivi.kentta);
    fd.set("hanke_id", rivi.hanke_id ?? "");
    fd.set("lahde_url", rivi.lahteet[0]?.lahde_url ?? "");
    fd.set("arvo", rivi.arvo ?? "");
    fd.set("huomautus", huomautus.trim());
    try {
      await kasitteleViranomaisVahvistusEiTueToiminto(fd);
      const seuraavat = jono.filter((r) => r.avain !== rivi.avain);
      setJono(seuraavat);
      setAktiivinen((i) => Math.min(i, Math.max(0, seuraavat.length - 1)));
      setPoikkeamaAuki(false);
      setHuomautus("");
      router.refresh();
    } catch (syy) {
      setVirhe(syy instanceof Error ? syy.message : "Tallennus epäonnistui.");
    } finally {
      setTallentaa(false);
    }
  }, [rivi, tallentaa, vainLuku, ryhma, huomautus, jono, router]);

  if (jono.length === 0) {
    return <p className="mt-4">Jonossa ei ole käsittelemättömiä rivejä.</p>;
  }

  if (!rivi) return null;

  const kysyLuonne = LUONNE_KENTAT.has(rivi.kentta);

  const kenttaNimi =
    rivi.kentta.includes(",")
      ? "määräajat (alkaa, päättyy, tyyppi)"
      : (HANKE_KENTTA_NIMET[rivi.kentta] ?? rivi.kentta);

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Rivi {aktiivinen + 1} / {jono.length}
        {vainLuku ? " · otos (ei tallenna)" : ""}
      </p>

      <article className="mt-4 border-y border-border py-4">
        <h2 className="text-xl font-semibold">
          {rivi.hanke_id ? (
            <a href={`/hankkeet/${rivi.hanke_id}`} className="text-link underline">
              {rivi.otsikko}
            </a>
          ) : (
            rivi.otsikko
          )}
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

        <ul className="mt-4 space-y-3">
          {rivi.lahteet.map((lahde) => {
            const heur = luokitteleLainauksenLuonne(lahde.lainaus);
            const tallennettu = lahde.lainauksen_luonne;
            return (
            <li key={lahde.lahde_id} className="text-sm leading-relaxed">
              <p>
                <span className="font-medium">Lainaus: </span>
                {lahde.lainaus?.trim() || (
                  <span className="text-muted">ei lainausta</span>
                )}
              </p>
              <p className="mt-1 text-muted">
                sivu {lahde.lahde_sivu ?? "—"} · {lahde.lahde_tyyppi} ·{" "}
                <a
                  href={lahde.lahde_url}
                  className="text-link underline"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  lähde
                </a>
              </p>
              {tallennettu ? (
                <p className="mt-1 text-muted">
                  Lainauksen luonne:{" "}
                  {LAINAUKSEN_LUONNE_NIMET[
                    tallennettu as keyof typeof LAINAUKSEN_LUONNE_NIMET
                  ] ?? tallennettu}
                </p>
              ) : (
                <p className="mt-1 text-muted">
                  Lainauksen luonne: ei luokiteltu
                  {heur
                    ? ` · heuristinen arvio: ${LAINAUKSEN_LUONNE_NIMET[heur]}`
                    : ""}
                </p>
              )}
              {kysyLuonne && !vainLuku && !tallennettu ? (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void (async () => {
                      const valinta = luonneValinta[lahde.lahde_id];
                      if (!valinta) {
                        setVirhe("Valitse lainauksen luonne.");
                        return;
                      }
                      setTallentaa(true);
                      setVirhe(null);
                      const fd = new FormData();
                      fd.set("lahde_id", lahde.lahde_id);
                      fd.set("lainauksen_luonne", valinta);
                      fd.set("hanke_id", rivi.hanke_id ?? "");
                      try {
                        await asetaLainauksenLuonneToiminto(fd);
                        setJono((jon) =>
                          jon.map((r) =>
                            r.avain !== rivi.avain
                              ? r
                              : {
                                  ...r,
                                  lahteet: r.lahteet.map((l) =>
                                    l.lahde_id === lahde.lahde_id
                                      ? { ...l, lainauksen_luonne: valinta }
                                      : l,
                                  ),
                                },
                          ),
                        );
                        router.refresh();
                      } catch (syy) {
                        setVirhe(
                          syy instanceof Error
                            ? syy.message
                            : "Luokituksen tallennus epäonnistui.",
                        );
                      } finally {
                        setTallentaa(false);
                      }
                    })();
                  }}
                >
                  <label className="text-sm">
                    Aseta luokka
                    <select
                      className="ml-2 border border-border bg-background px-2 py-1 text-sm"
                      value={luonneValinta[lahde.lahde_id] ?? ""}
                      onChange={(e) =>
                        setLuonneValinta((v) => ({
                          ...v,
                          [lahde.lahde_id]: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">—</option>
                      {LAINAUKSEN_LUONTEET.map((k) => (
                        <option key={k} value={k}>
                          {LAINAUKSEN_LUONNE_NIMET[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={tallentaa}
                    className="border border-border px-2 py-1 text-sm disabled:opacity-50"
                  >
                    Tallenna luokka
                  </button>
                </form>
              ) : null}
            </li>
            );
          })}
        </ul>

        {virhe ? <p className="mt-3 text-sm text-red-700">{virhe}</p> : null}

        {vainLuku ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="border border-border px-3 py-2 text-sm"
              onClick={() => {
                setArviot((a) => ({ ...a, [rivi.avain]: "tukee" }));
                setAktiivinen((i) => Math.min(i + 1, jono.length - 1));
              }}
            >
              Tukee arvoa (otos)
            </button>
            <button
              type="button"
              className="border border-border px-3 py-2 text-sm"
              onClick={() => {
                setArviot((a) => ({ ...a, [rivi.avain]: "ei_tue" }));
                setAktiivinen((i) => Math.min(i + 1, jono.length - 1));
              }}
            >
              Ei tue (otos)
            </button>
            <p className="w-full text-sm text-muted">
              Arvioitu: {Object.keys(arviot).length} / {jono.length}
              {Object.keys(arviot).length > 0
                ? ` · ei tue ${Object.values(arviot).filter((v) => v === "ei_tue").length}`
                : ""}
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={tallentaa}
              className="border border-border bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50"
              onClick={() => void merkitseTukee()}
            >
              Tukee arvoa
            </button>
            <button
              type="button"
              disabled={tallentaa}
              className="border border-border px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => setPoikkeamaAuki((v) => !v)}
            >
              Ei tue
            </button>
          </div>
        )}

        {poikkeamaAuki && !vainLuku ? (
          <div className="mt-4 space-y-2">
            <label className="block text-sm" htmlFor="poikkeama-huom">
              Miksi lähde ei tue arvoa?
            </label>
            <textarea
              id="poikkeama-huom"
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
              Vie poikkeama jonoon
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
          onClick={() => setAktiivinen((i) => Math.min(jono.length - 1, i + 1))}
        >
          Seuraava
        </button>
      </div>
    </div>
  );
}
