import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { geokoodaaOsoite } from "../src/lib/geokoodaus";
import type { EhdotusSisalto } from "../src/lib/ehdotus";
import {
  hylkaaMuutosehdotus,
  hyvaksyMuutosehdotus,
} from "../src/lib/supabase/hyvaksynta";

const KASITTELIJA = "Jyri Venninen";

/** Vanhemmat sijainti_alue-duplikaatit (uudempi jo hyväksytty). */
const HYLATTAVAT_DUPLIKAATIT: Record<string, string> = {
  "f4a70390-a951-4220-be69-c3e99b729a11":
    "Duplikaatti: sijainti_alue jo hyväksytty (Tervahovintie 10).",
  "8a0031fe-85b0-44a0-a16c-08f55be1b35f":
    "Duplikaatti: sijainti_alue jo hyväksytty (Vartiokallionkatu 2).",
  "7a9dadab-4d7c-4bb9-91f3-2ae8ecd31dc9":
    "Duplikaatti: sijainti_alue jo hyväksytty (Emalikatu 13).",
  "86d3e2b0-769a-40c4-a455-e35e6a216f33":
    "Duplikaatti: sijainti_alue jo hyväksytty (Huutokoski).",
  "afe0dd9f-3da5-4186-8f66-85105dd8b29a":
    "Duplikaatti: sijainti_alue jo hyväksytty (Renforsin Ranta).",
};

/** Yksinkertaistettu osoite geokoodausta varten. */
const YKSINKERTAISTETUT: Record<string, string> = {
  "4b1f3572-658e-44ec-846f-864f231904f9": "Söderkulla, Sipoo",
  "83b88dc7-8266-49d6-ae99-85a34c0d8795": "Hanhela, Raahe",
};

/** Suora lat/lon kun alueen nimi ei geokoodaudu (sama teollisuusalue kuin lähde). */
const SUORA_SIJAINTI: Record<
  string,
  { lat: number; lon: number; lahdeHanke: string }
> = {
  "154a5d47-9e21-47e7-b2ff-953437d58c1e": {
    lat: 63.062406,
    lon: 21.771223,
    lahdeHanke: "Microsoft Vaasa–Mustasaari (GigaVaasa)",
  },
};

async function asetaSuoraSijainti(
  sb: SupabaseClient,
  id: string,
  lat: number,
  lon: number,
): Promise<void> {
  const { data: e } = await sb
    .from("muutosehdotukset")
    .select("sisalto")
    .eq("id", id)
    .eq("tila", "odottaa")
    .single();
  if (!e) throw new Error("Ei löydy");
  const sis = e.sisalto as EhdotusSisalto;
  const vanha = sis.kentat?.sijainti_alue;
  if (!vanha) throw new Error("sijainti_alue puuttuu");
  const pohja = { ...vanha, luottamus: "epavarma" as const };
  const korjattu: EhdotusSisalto = {
    ...sis,
    kentat: {
      sijainti_lat: { ...pohja, arvo: String(lat) },
      sijainti_lon: { ...pohja, arvo: String(lon) },
    },
  };
  const { error } = await sb
    .from("muutosehdotukset")
    .update({ sisalto: korjattu })
    .eq("id", id)
    .eq("tila", "odottaa");
  if (error) throw new Error(error.message);
}

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  for (const [id, syy] of Object.entries(HYLATTAVAT_DUPLIKAATIT)) {
    try {
      await hylkaaMuutosehdotus(id, KASITTELIJA, syy);
      console.log(`⊘ ${id.slice(0, 8)}… duplikaatti`);
    } catch (e) {
      console.log(`✗ hylkäys ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  for (const [id, osoite] of Object.entries(YKSINKERTAISTETUT)) {
    const { data: e } = await sb
      .from("muutosehdotukset")
      .select("sisalto, hanke_id")
      .eq("id", id)
      .eq("tila", "odottaa")
      .maybeSingle();
    if (!e) continue;

    try {
      await geokoodaaOsoite(osoite);
    } catch {
      console.log(`✗ ${id.slice(0, 8)}… geokoodaus epäonnistui: ${osoite}`);
      continue;
    }

    const sis = e.sisalto as EhdotusSisalto;
    const vanha = sis.kentat?.sijainti_alue;
    if (!vanha) continue;
    const korjattu: EhdotusSisalto = {
      ...sis,
      kentat: {
        ...sis.kentat,
        sijainti_alue: { ...vanha, arvo: osoite },
      },
    };
    await sb
      .from("muutosehdotukset")
      .update({ sisalto: korjattu })
      .eq("id", id)
      .eq("tila", "odottaa");

    try {
      await hyvaksyMuutosehdotus(id, KASITTELIJA);
      console.log(`✓ ${id.slice(0, 8)}… ${osoite}`);
    } catch (err) {
      console.log(`✗ ${id.slice(0, 8)}… ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const [id, sij] of Object.entries(SUORA_SIJAINTI)) {
    try {
      await asetaSuoraSijainti(sb, id, sij.lat, sij.lon);
      await hyvaksyMuutosehdotus(id, KASITTELIJA);
      console.log(`✓ ${id.slice(0, 8)}… lat/lon (${sij.lahdeHanke})`);
    } catch (err) {
      console.log(`✗ ${id.slice(0, 8)}… ${err instanceof Error ? err.message : err}`);
    }
  }

  const { count } = await sb
    .from("muutosehdotukset")
    .select("*", { count: "exact", head: true })
    .eq("tila", "odottaa");
  console.log(`Odottaa vielä: ${count ?? "?"}`);
}

main();
