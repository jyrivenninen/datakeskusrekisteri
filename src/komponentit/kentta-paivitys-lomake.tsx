"use client";

import { useState } from "react";
import { LomakeLahetysNappi } from "@/komponentit/lomake-lahetysnappi";
import { PakollinenMerkki } from "@/komponentit/pakollinen-merkki";

type Valinta = { arvo: string; nimi: string };

export function KenttaPaivitysLomake({
  action,
  hankeId,
  kentta,
  vaihtoehto,
  nykyinenArvo,
  voiTyhjentaa,
  onVaihe,
  vaiheValinnat,
  yksikko,
  yksikkoOletus,
  lainausPakollinen,
  julkaiseSuoraan,
  luottamusValinnat,
}: {
  action: (formData: FormData) => Promise<void>;
  hankeId: string;
  kentta: string;
  vaihtoehto: string | null;
  nykyinenArvo: string;
  voiTyhjentaa: boolean;
  onVaihe: boolean;
  vaiheValinnat: Valinta[];
  yksikko: "diesel" | "polttoaine" | null;
  yksikkoOletus: string;
  lainausPakollinen: boolean;
  julkaiseSuoraan: boolean;
  luottamusValinnat: Valinta[];
}) {
  const [tyhjennys, setTyhjennys] = useState(false);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="hanke_id" value={hankeId} />
      <input type="hidden" name="kentta" value={kentta} />
      {vaihtoehto ? <input type="hidden" name="vaihtoehto" value={vaihtoehto} /> : null}
      <input type="hidden" name="nykyinen_arvo" value={nykyinenArvo} />
      <input type="hidden" name="toiminto" value={tyhjennys ? "tyhjennys" : "paivitys"} />

      {voiTyhjentaa ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Muutos</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="muutos_tapa"
              className="mt-1"
              checked={!tyhjennys}
              onChange={() => setTyhjennys(false)}
            />
            Anna uusi arvo
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="muutos_tapa"
              className="mt-1"
              checked={tyhjennys}
              onChange={() => setTyhjennys(true)}
            />
            Tyhjennä arvo
          </label>
        </fieldset>
      ) : null}

      {tyhjennys ? null : (
        <>
          <p className="flex flex-col gap-1">
            <label htmlFor="arvo" className="text-sm font-medium">
              Uusi arvo
              <PakollinenMerkki />
            </label>
            {onVaihe ? (
              <select
                id="arvo"
                name="arvo"
                required
                defaultValue=""
                className="rounded border border-border bg-surface px-2 py-2"
              >
                <option value="">Valitse vaihe</option>
                {vaiheValinnat.map((vaihe) => (
                  <option key={vaihe.arvo} value={vaihe.arvo}>
                    {vaihe.nimi}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="arvo"
                name="arvo"
                required
                className="rounded border border-border bg-surface px-2 py-2"
              />
            )}
          </p>

          {yksikko ? (
            <p className="flex flex-col gap-1">
              <label htmlFor="yksikko" className="text-sm font-medium">
                Yksikkö
                <PakollinenMerkki />
              </label>
              <select
                id="yksikko"
                name="yksikko"
                required
                defaultValue={yksikkoOletus}
                className="rounded border border-border bg-surface px-2 py-2"
              >
                {yksikko === "diesel" ? (
                  <>
                    <option value="litra">litra</option>
                    <option value="m3">m³</option>
                  </>
                ) : (
                  <>
                    <option value="m3">m³</option>
                    <option value="litra">litra</option>
                    <option value="mw">MW</option>
                  </>
                )}
              </select>
            </p>
          ) : null}

          <p className="flex flex-col gap-1">
            <label htmlFor="lahde_url" className="text-sm font-medium">
              Lähteen osoite
              <PakollinenMerkki />
            </label>
            <input
              id="lahde_url"
              name="lahde_url"
              type="url"
              required
              placeholder="https://"
              className="rounded border border-border bg-surface px-2 py-2"
            />
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="lahde_sivu" className="text-sm font-medium">
              Sivunumero
            </label>
            <input
              id="lahde_sivu"
              name="lahde_sivu"
              inputMode="numeric"
              className="rounded border border-border bg-surface px-2 py-2"
            />
            <span className="text-sm text-muted">Jos lähde on asiakirja.</span>
          </p>
          <p className="flex flex-col gap-1">
            <label htmlFor="lainaus" className="text-sm font-medium">
              Sanatarkka kohta lähteestä
              {lainausPakollinen ? <PakollinenMerkki /> : null}
            </label>
            <textarea
              id="lainaus"
              name="lainaus"
              rows={3}
              required={lainausPakollinen}
              className="rounded border border-border bg-surface px-2 py-2"
            />
            {lainausPakollinen ? (
              <span className="text-sm text-muted">Kohdasta pitää ilmetä, kuka luvun on laskenut.</span>
            ) : null}
          </p>
          {julkaiseSuoraan ? (
            <p className="flex flex-col gap-1">
              <label htmlFor="luottamus" className="text-sm font-medium">
                Luottamus
              </label>
              <select
                id="luottamus"
                name="luottamus"
                defaultValue="vahvistettu"
                className="rounded border border-border bg-surface px-2 py-2"
              >
                {luottamusValinnat.map((taso) => (
                  <option key={taso.arvo} value={taso.arvo}>
                    {taso.nimi}
                  </option>
                ))}
              </select>
            </p>
          ) : null}
        </>
      )}

      <p className="flex flex-col gap-1">
        <label htmlFor="kommentti" className="text-sm font-medium">
          Kommentti
          {tyhjennys ? <PakollinenMerkki /> : null}
        </label>
        <textarea
          id="kommentti"
          name="kommentti"
          rows={3}
          required={tyhjennys}
          minLength={tyhjennys ? 12 : undefined}
          className="rounded border border-border bg-surface px-2 py-2"
        />
        <span className="text-sm text-muted">
          {tyhjennys
            ? "Kerro, miksi arvo tyhjennetään. Vähintään 12 merkkiä."
            : "Vapaaehtoinen tieto ylläpitäjälle. Ei julkaista."}
        </span>
      </p>

      {tyhjennys && julkaiseSuoraan ? (
        <p className="flex items-start gap-2">
          <input
            id="merkitse_ei_lahdetta"
            name="merkitse_ei_lahdetta"
            type="checkbox"
            value="kylla"
            className="mt-1"
          />
          <label htmlFor="merkitse_ei_lahdetta" className="text-sm">
            Merkitse tyhjän kentän tarkistetuksi: julkista lähdettä ei ole
          </label>
        </p>
      ) : null}

      <LomakeLahetysNappi
        valmis={
          tyhjennys
            ? julkaiseSuoraan
              ? "Tyhjennä ja julkaise"
              : "Lähetä tyhjennys tarkistettavaksi"
            : julkaiseSuoraan
              ? "Julkaise päivitys"
              : "Lähetä tarkistettavaksi"
        }
        odottaa="Lähetetään…"
      />
    </form>
  );
}
