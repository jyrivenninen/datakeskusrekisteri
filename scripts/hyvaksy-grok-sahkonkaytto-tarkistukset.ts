/**
 * Hyväksyy Grok-botin sahkonkaytto_twh_a kentta_tarkistus -ehdotukset (ei GWh-lähdettä).
 * Hylkää selvästi merkityt duplikaatti-hankkeen rivit.
 *
 * Kuiva: KUIVA=1 npx tsx scripts/hyvaksy-grok-sahkonkaytto-tarkistukset.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import { hyvaksyMuutosehdotus, hylkaaMuutosehdotus } from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "scripts/hyvaksy-grok-sahkonkaytto-tarkistukset";

function onDuplikaattiHylattava(huomautus: string | null): boolean {
  if (!huomautus) return false;
  return /tälle UUID:lle|tayttoa ei tehdä tälle UUID/i.test(huomautus);
}

function kenttaHuomautuksesta(huomautus: string | null): string | null {
  if (!huomautus) return null;
  const osuma = huomautus.match(/^([a-z][a-z0-9_]*):/);
  return osuma?.[1] ?? null;
}

function normalisoiTarkistusSisalto(
  sisalto: EhdotusSisalto,
  hankeId: string,
  huomautus: string | null,
): EhdotusSisalto | null {
  const kentta =
    sisalto.tarkistus?.kentta?.trim() || kenttaHuomautuksesta(huomautus);
  if (!kentta) return null;

  const tarkistusHuomautus =
    sisalto.tarkistus?.huomautus?.trim() ||
    (huomautus?.includes(":") ? huomautus.split(":").slice(1).join(":").trim() : huomautus) ||
    null;

  return {
    ...sisalto,
    kentat: sisalto.kentat ?? {},
    tarkistus: {
      taulu: "hankkeet",
      rivi_id: sisalto.tarkistus?.rivi_id ?? hankeId,
      kentta,
      tulos: "ei_julkista_lahdetta",
      huomautus: tarkistusHuomautus,
    },
  };
}

async function korjaaSisalto(
  sb: SupabaseClient,
  id: string,
  sisalto: EhdotusSisalto,
): Promise<void> {
  const { error } = await sb
    .from("muutosehdotukset")
    .update({ sisalto })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const kuiva = process.env.KUIVA === "1";
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("muutosehdotukset")
    .select("id, hanke_id, huomautus, sisalto")
    .eq("tyyppi", "kentta_tarkistus")
    .eq("tila", "odottaa")
    .eq("ehdottaja_tunniste", "grok-taydennys-2026-09-07");
  if (error) throw error;

  let hyvaksytty = 0;
  let hylatty = 0;
  const virheet: string[] = [];

  for (const rivi of data ?? []) {
    const alkuperainen = (rivi.sisalto ?? { kentat: {} }) as EhdotusSisalto;
    const korjattu = normalisoiTarkistusSisalto(
      alkuperainen,
      rivi.hanke_id!,
      rivi.huomautus,
    );
    if (!korjattu?.tarkistus?.kentta) {
      console.log(`Ohitetaan ${rivi.id.slice(0, 8)}: tarkistus-kenttä puuttuu`);
      continue;
    }
    if (korjattu.tarkistus.kentta !== "sahkonkaytto_twh_a") {
      console.log(`Ohitetaan ${rivi.id.slice(0, 8)}: kentta=${korjattu.tarkistus.kentta}`);
      continue;
    }

    if (onDuplikaattiHylattava(rivi.huomautus)) {
      console.log(`Hylätään duplikaatti ${rivi.id.slice(0, 8)}`);
      if (!kuiva) {
        try {
          await hylkaaMuutosehdotus(
            rivi.id,
            KASITTELIJA,
            rivi.huomautus ?? "Duplikaatti-hanke: kenttä tarkistetaan vain kerran päähankkeelle.",
          );
          hylatty += 1;
        } catch (syy) {
          virheet.push(`${rivi.id}: ${syy instanceof Error ? syy.message : syy}`);
        }
      } else {
        hylatty += 1;
      }
      continue;
    }

    console.log(`Hyväksytään ${rivi.id.slice(0, 8)}`);
    if (!kuiva) {
      try {
        if (!alkuperainen.tarkistus?.kentta) {
          await korjaaSisalto(sb, rivi.id, korjattu);
        }
        await hyvaksyMuutosehdotus(rivi.id, KASITTELIJA);
        hyvaksytty += 1;
      } catch (syy) {
        virheet.push(`${rivi.id}: ${syy instanceof Error ? syy.message : syy}`);
      }
    } else {
      hyvaksytty += 1;
    }
  }

  console.log(
    `Valmis${kuiva ? " (kuiva)" : ""}: ${hyvaksytty} hyväksytty, ${hylatty} hylätty, ${virheet.length} virhettä.`,
  );
  for (const v of virheet) console.error(v);
  if (virheet.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
