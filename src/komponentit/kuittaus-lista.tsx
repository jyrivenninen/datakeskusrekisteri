"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { kuitaaValitutToiminto } from "@/app/toiminnot";
import {
  jarjestaKuittausRivit,
  kuittausSuodatusPolku,
  onKuittausSuodatusAktiivinen,
  parsiKuittausSuodatus,
  suodataKuittausRivit,
  type KuittausJarjestys,
  type KuittausSuodatus,
} from "@/lib/kuittaus-suodatus";
import type { KuittausNakymaRivi } from "@/lib/kuittaus";
import { parsiHakusana, HAKU_DEBOUNCE_MS } from "@/lib/haku";
import { HANKE_KENTTA_NIMET, LUOTTAMUS_NIMET, VAIHE_NIMET } from "@/lib/naytto";
import { HANKE_VAIHEET, LUOTTAMUSTASOT, type Luottamus } from "@/lib/supabase/tietokanta";
import { kuittausKenttaNimi } from "@/lib/kuittaus";

type RiviTila = {
  kuitaa: boolean;
  luottamus: Luottamus;
};

const KUITTAUS_LUOTTAMUKSET = ["vahvistettu", "epavarma"] as const;

function alkuTilat(rivit: KuittausNakymaRivi[]): Record<string, RiviTila> {
  return Object.fromEntries(
    rivit.map((r) => [r.avain, { kuitaa: false, luottamus: r.luottamus }]),
  );
}

function HakuKuvake() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20L16 16" strokeLinecap="round" />
    </svg>
  );
}

export function KuittausLista({
  kaikkiRivit,
  suodatus,
  jarjestys,
  kunnat,
  toimijat,
  kentat,
  palvelinAvain,
}: {
  kaikkiRivit: KuittausNakymaRivi[];
  suodatus: KuittausSuodatus;
  jarjestys: KuittausJarjestys;
  kunnat: string[];
  toimijat: string[];
  kentat: string[];
  palvelinAvain: boolean;
}) {
  const router = useRouter();
  const [hakuPaikallinen, setHakuPaikallinen] = useState(suodatus.q ?? "");
  const viiveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pyyntoRef = useRef(0);

  const nakyvatRivit = useMemo(() => {
    const suodatetut = suodataKuittausRivit(kaikkiRivit, suodatus);
    return jarjestaKuittausRivit(suodatetut, jarjestys);
  }, [kaikkiRivit, suodatus, jarjestys]);

  const [tilat, setTilat] = useState<Record<string, RiviTila>>(() => alkuTilat(kaikkiRivit));

  useEffect(() => {
    setTilat((edellinen) => {
      const uusi = alkuTilat(kaikkiRivit);
      for (const rivi of kaikkiRivit) {
        const ed = edellinen[rivi.avain];
        if (ed && !ed.kuitaa && ed.luottamus !== rivi.luottamus) {
          uusi[rivi.avain] = ed;
        }
      }
      return uusi;
    });
  }, [kaikkiRivit]);

  useEffect(() => {
    setHakuPaikallinen(suodatus.q ?? "");
  }, [suodatus.q]);

  useEffect(() => {
    return () => {
      if (viiveRef.current) clearTimeout(viiveRef.current);
    };
  }, []);

  const paivitaUrl = useCallback(
    (uusi: KuittausSuodatus, uusiJarjestys?: KuittausJarjestys) => {
      router.replace(kuittausSuodatusPolku(uusi, uusiJarjestys ?? jarjestys), { scroll: false });
    },
    [router, jarjestys],
  );

  const onHakuMuutos = (arvo: string) => {
    setHakuPaikallinen(arvo);
    if (viiveRef.current) clearTimeout(viiveRef.current);
    const pyynto = ++pyyntoRef.current;
    viiveRef.current = setTimeout(() => {
      if (pyynto !== pyyntoRef.current) return;
      paivitaUrl({ ...suodatus, q: parsiHakusana(arvo) });
    }, HAKU_DEBOUNCE_MS);
  };

  const suodatusAktiivinen = onKuittausSuodatusAktiivinen(suodatus);

  const muutoksia = nakyvatRivit.filter((rivi) => {
    const t = tilat[rivi.avain];
    if (!t) return false;
    return t.kuitaa || t.luottamus !== rivi.luottamus;
  });

  const kuitattavia = nakyvatRivit.filter((rivi) => tilat[rivi.avain]?.kuitaa);

  const valitseKaikkiNakyvat = () => {
    setTilat((ed) => {
      const uusi = { ...ed };
      for (const rivi of nakyvatRivit) {
        const nykyinen = uusi[rivi.avain] ?? { kuitaa: false, luottamus: rivi.luottamus };
        uusi[rivi.avain] = {
          kuitaa: true,
          luottamus:
            nykyinen.luottamus === "ristiriitainen" ? "vahvistettu" : nykyinen.luottamus,
        };
      }
      return uusi;
    });
  };

  const tyhjennaKuittaukset = () => {
    setTilat((ed) => {
      const uusi = { ...ed };
      for (const rivi of nakyvatRivit) {
        const nykyinen = uusi[rivi.avain] ?? { kuitaa: false, luottamus: rivi.luottamus };
        uusi[rivi.avain] = { ...nykyinen, kuitaa: false };
      }
      return uusi;
    });
  };

  const muutosJson = JSON.stringify(
    muutoksia.map((rivi) => ({
      avain: rivi.avain,
      hanke_id: rivi.hanke_id,
      lahde_kentta: rivi.lahde_kentta,
      kuitaa: tilat[rivi.avain]?.kuitaa ?? false,
      luottamus: tilat[rivi.avain]?.luottamus ?? rivi.luottamus,
    })),
  );

  return (
    <div className="mt-6 space-y-6">
      <form
        className="space-y-4 rounded border border-border bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          paivitaUrl(parsiKuittausSuodatus({
            q: hakuPaikallinen,
            kunta: (e.currentTarget.elements.namedItem("kunta") as HTMLSelectElement)?.value,
            toimija: (e.currentTarget.elements.namedItem("toimija") as HTMLSelectElement)?.value,
            vaihe: (e.currentTarget.elements.namedItem("vaihe") as HTMLSelectElement)?.value,
            kentta: (e.currentTarget.elements.namedItem("kentta") as HTMLSelectElement)?.value,
            taydennys: (e.currentTarget.elements.namedItem("taydennys") as HTMLInputElement)
              ?.checked
              ? "1"
              : undefined,
            ennen: (e.currentTarget.elements.namedItem("ennen") as HTMLSelectElement)?.value,
          }));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative sm:col-span-2 lg:col-span-3">
            <label htmlFor="kuittaus-haku" className="sr-only">
              Hae hanketta, kuntaa tai kenttää
            </label>
            <HakuKuvake />
            <input
              id="kuittaus-haku"
              type="search"
              value={hakuPaikallinen}
              onChange={(e) => onHakuMuutos(e.target.value)}
              placeholder="Hae hanketta, kuntaa, vastaavaa tai kenttää…"
              className="w-full rounded border border-border bg-background py-2 pl-10 pr-3 text-sm"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="kunta" className="block text-sm font-medium">
              Kunta
            </label>
            <select
              id="kunta"
              name="kunta"
              defaultValue={suodatus.kunta ?? ""}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Kaikki</option>
              {kunnat.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="toimija" className="block text-sm font-medium">
              Hankkeesta vastaava
            </label>
            <select
              id="toimija"
              name="toimija"
              defaultValue={suodatus.toimija ?? ""}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Kaikki</option>
              {toimijat.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vaihe" className="block text-sm font-medium">
              Vaihe
            </label>
            <select
              id="vaihe"
              name="vaihe"
              defaultValue={suodatus.vaihe ?? ""}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Kaikki</option>
              {HANKE_VAIHEET.map((v) => (
                <option key={v} value={v}>
                  {VAIHE_NIMET[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kentta" className="block text-sm font-medium">
              Kenttä
            </label>
            <select
              id="kentta"
              name="kentta"
              defaultValue={suodatus.kentta ?? ""}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Kaikki</option>
              {kentat.map((k) => (
                <option key={k} value={k}>
                  {HANKE_KENTTA_NIMET[k] ?? kuittausKenttaNimi(k)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ennen" className="block text-sm font-medium">
              Ennen agenttia
            </label>
            <select
              id="ennen"
              name="ennen"
              defaultValue={suodatus.ennen ?? ""}
              className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">Kaikki</option>
              <option value="taydennys">Täydennys (puuttui)</option>
              <option value="korjaus">Korjaus</option>
              <option value="puuttuu">Ei tietoa</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                id="taydennys"
                name="taydennys"
                type="checkbox"
                value="1"
                defaultChecked={suodatus.taydennys}
                className="size-4"
              />
              Vain täydennykset
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded border border-foreground px-3 py-1.5 text-sm"
          >
            Suodata
          </button>
          {suodatusAktiivinen ? (
            <Link href="/yllapito/kuittaus" className="text-sm text-link underline">
              Tyhjennä suodattimet
            </Link>
          ) : null}
          <div className="ml-auto">
            <label htmlFor="jarjestys" className="sr-only">
              Järjestys
            </label>
            <select
              id="jarjestys"
              value={jarjestys}
              onChange={(e) =>
                paivitaUrl(suodatus, e.target.value as KuittausJarjestys)
              }
              className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="hanke">Järjestä: hanke</option>
              <option value="kunta">Järjestä: kunta</option>
              <option value="vaihe">Järjestä: vaihe</option>
              <option value="kentta">Järjestä: kenttä</option>
              <option value="luottamus">Järjestä: luottamus</option>
            </select>
          </div>
        </div>
      </form>

      <p className="text-sm text-muted">
        {nakyvatRivit.length} / {kaikkiRivit.length} riviä
        {suodatusAktiivinen ? " (suodatettu)" : ""}
      </p>

      {nakyvatRivit.length === 0 ? (
        <p>Ei rivejä valituilla suodattimilla.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={valitseKaikkiNakyvat}
              className="text-sm text-link underline"
            >
              Valitse kaikki näkyvät kuittaukseen
            </button>
            <button
              type="button"
              onClick={tyhjennaKuittaukset}
              className="text-sm text-link underline"
            >
              Tyhjennä kuittausvalinnat
            </button>
          </div>

          <form action={kuitaaValitutToiminto} className="space-y-4">
            <input type="hidden" name="q" value={suodatus.q ?? ""} />
            <input type="hidden" name="kunta" value={suodatus.kunta ?? ""} />
            <input type="hidden" name="toimija" value={suodatus.toimija ?? ""} />
            <input type="hidden" name="vaihe" value={suodatus.vaihe ?? ""} />
            <input type="hidden" name="kentta" value={suodatus.kentta ?? ""} />
            <input type="hidden" name="taydennys" value={suodatus.taydennys ? "1" : ""} />
            <input type="hidden" name="ennen" value={suodatus.ennen ?? ""} />
            <input type="hidden" name="muutokset" value={muutosJson} />

            <ul className="divide-y divide-border border-y border-border">
              {nakyvatRivit.map((rivi) => {
                const tila = tilat[rivi.avain] ?? { kuitaa: false, luottamus: rivi.luottamus };
                const luottamusVaihtoehdot = tila.kuitaa
                  ? KUITTAUS_LUOTTAMUKSET
                  : LUOTTAMUSTASOT;

                return (
                  <li key={rivi.avain} className="py-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <label className="flex shrink-0 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={tila.kuitaa}
                          onChange={(e) => {
                            const valittu = e.target.checked;
                            setTilat((ed) => ({
                              ...ed,
                              [rivi.avain]: {
                                kuitaa: valittu,
                                luottamus:
                                  valittu && ed[rivi.avain]?.luottamus === "ristiriitainen"
                                    ? "vahvistettu"
                                    : (ed[rivi.avain]?.luottamus ?? rivi.luottamus),
                              },
                            }));
                          }}
                          className="size-4"
                        />
                        <span>Kuittaa</span>
                      </label>
                      <div className="min-w-0 flex-1">
                        <p>
                          <Link href={`/hankkeet/${rivi.hanke_id}`} className="text-link underline">
                            {rivi.hanke_nimi}
                          </Link>
                          {" · "}
                          {rivi.kunta}
                          {" · "}
                          {rivi.nimi}
                        </p>
                        <p className="mt-1 text-sm">
                          <span className="font-medium">{rivi.arvo}</span>
                          <span className="text-muted"> · {rivi.vaihe}</span>
                          {rivi.toimija_nimi ? (
                            <span className="text-muted"> · {rivi.toimija_nimi}</span>
                          ) : null}
                        </p>
                        {rivi.ennenAgenttia ? (
                          <p className="mt-1 text-sm text-muted">
                            Ennen agenttia: {rivi.ennenAgenttia}
                          </p>
                        ) : null}
                        {rivi.lainaus ? (
                          <blockquote className="mt-2 border-l-2 pl-3 text-sm">{rivi.lainaus}</blockquote>
                        ) : null}
                        {rivi.lahde_url ? (
                          <p className="mt-1 text-sm">
                            <a
                              href={rivi.lahde_url}
                              className="text-link underline"
                              rel="noopener noreferrer"
                            >
                              {rivi.lahde_url}
                            </a>
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0">
                        <label htmlFor={`luottamus-${rivi.avain}`} className="block text-xs text-muted">
                          Luottamus
                        </label>
                        <select
                          id={`luottamus-${rivi.avain}`}
                          value={tila.luottamus}
                          onChange={(e) =>
                            setTilat((ed) => ({
                              ...ed,
                              [rivi.avain]: {
                                ...(ed[rivi.avain] ?? { kuitaa: false, luottamus: rivi.luottamus }),
                                luottamus: e.target.value as Luottamus,
                              },
                            }))
                          }
                          className="mt-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
                        >
                          {luottamusVaihtoehdot.map((l) => (
                            <option key={l} value={l}>
                              {LUOTTAMUS_NIMET[l]}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-muted">{rivi.vanha.merkitty}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {palvelinAvain ? (
              <div className="space-y-2">
                {kuitattavia.length > 0 && !suodatusAktiivinen ? (
                  <p className="text-sm text-muted">
                    Kuittaus vaatii vähintään yhden suodattimen. Aseta suodatin ennen kuittausta.
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={muutoksia.length === 0 || (kuitattavia.length > 0 && !suodatusAktiivinen)}
                  className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40"
                >
                  Tallenna muutokset
                  {muutoksia.length > 0 ? ` (${muutoksia.length})` : ""}
                </button>
              </div>
            ) : (
              <p className="text-sm">
                Kuittaus vaatii palvelinavaimen <code>SUPABASE_SERVICE_ROLE_KEY</code>.
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
