import { ILMOITUS_LUOTTAMUKSET } from "@/lib/ehdotus";
import { HANKE_KENTTA_NIMET, LUOTTAMUS_NIMET, VAIHE_NIMET } from "@/lib/naytto";
import { HANKE_VAIHEET } from "@/lib/supabase/tietokanta";

export function IlmoitusKenttalohko({
  kentta,
  pakollinen,
}: {
  kentta: string;
  pakollinen: boolean;
}) {
  const otsikko =
    kentta === "toimija_nimi"
      ? "Hankkeesta vastaava (nimi)"
      : (HANKE_KENTTA_NIMET[kentta] ?? kentta);

  return (
    <fieldset className="space-y-3 rounded border border-border px-3 py-3">
      <legend className="px-1 text-sm font-medium">
        {otsikko}
        {pakollinen ? " (pakollinen)" : ""}
      </legend>
      {kentta === "vaihe" ? (
        <select
          id={kentta}
          name={kentta}
          required={pakollinen}
          className="w-full rounded border border-border bg-surface px-2 py-2"
          defaultValue=""
        >
          <option value="">Valitse vaihe</option>
          {HANKE_VAIHEET.map((vaihe) => (
            <option key={vaihe} value={vaihe}>
              {VAIHE_NIMET[vaihe]}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={kentta}
          name={kentta}
          required={pakollinen}
          className="w-full rounded border border-border bg-surface px-2 py-2"
        />
      )}
      <p className="flex flex-col gap-1">
        <label htmlFor={`${kentta}_lahde_url`} className="text-sm font-medium">
          Lähteen osoite tälle kentälle
        </label>
        <input
          id={`${kentta}_lahde_url`}
          name={`${kentta}_lahde_url`}
          type="url"
          placeholder="https:// (tyhjä = yhteinen lähde)"
          className="rounded border border-border bg-surface px-2 py-2"
        />
      </p>
      <p className="flex flex-col gap-1">
        <label htmlFor={`${kentta}_lahde_sivu`} className="text-sm">
          Sivunumero (jos asiakirja)
        </label>
        <input
          id={`${kentta}_lahde_sivu`}
          name={`${kentta}_lahde_sivu`}
          inputMode="numeric"
          className="rounded border border-border bg-surface px-2 py-2"
        />
      </p>
      <p className="flex flex-col gap-1">
        <label htmlFor={`${kentta}_lainaus`} className="text-sm">
          Sanatarkka kohta
        </label>
        <textarea
          id={`${kentta}_lainaus`}
          name={`${kentta}_lainaus`}
          rows={2}
          className="rounded border border-border bg-surface px-2 py-2"
        />
      </p>
      <p className="flex flex-col gap-1">
        <label htmlFor={`${kentta}_luottamus`} className="text-sm font-medium">
          Luottamus
        </label>
        <select
          id={`${kentta}_luottamus`}
          name={`${kentta}_luottamus`}
          defaultValue="epavarma"
          className="rounded border border-border bg-surface px-2 py-2"
        >
          {ILMOITUS_LUOTTAMUKSET.map((taso) => (
            <option key={taso} value={taso}>
              {LUOTTAMUS_NIMET[taso]}
            </option>
          ))}
        </select>
      </p>
    </fieldset>
  );
}
