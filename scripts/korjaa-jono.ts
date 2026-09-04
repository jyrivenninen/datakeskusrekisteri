/**
 * Hylkää selvästi virheelliset odottavat ehdotukset.
 * Aja: npx tsx scripts/korjaa-jono.ts
 * Kuiva: KORJAA_JONO_KUIVA=1 npx tsx scripts/korjaa-jono.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const KASITTELIJA = "scripts/korjaa-jono";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-avaimet puuttuvat.");

  const kuiva = process.env.KORJAA_JONO_KUIVA === "1";
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await sb
    .from("muutosehdotukset")
    .select("id,tyyppi,hanke_id,sisalto,huomautus,luotu_pvm")
    .eq("tila", "odottaa");
  if (error) throw error;

  type Hylkays = { id: string; syy: string };

  const hylattavat: Hylkays[] = [];

  for (const r of rows ?? []) {
    const s = (r.sisalto ?? {}) as Record<string, unknown>;

    if (r.tyyppi === "ristiriita_havainto") {
      const ri = s.ristiriita as { saanto?: string } | undefined;
      if (!ri?.saanto) {
        hylattavat.push({
          id: r.id,
          syy: "Väärä tyyppi/muoto: Grok-lohkoinen ristiriita_havainto ilman sisalto.ristiriita-rakennetta. Korvaa kentta_tyhjennys-, korjaus- tai ylläpidon toimenpiteellä (ks. GROK-OHJEET.md).",
        });
      }
    }

    if (r.tyyppi === "korjaus") {
      const kentat = (s.kentat ?? {}) as Record<string, { arvo?: string | null }>;
      const avaimet = Object.keys(kentat);
      if (avaimet.length === 0) {
        hylattavat.push({
          id: r.id,
          syy: "Korjausehdotuksessa ei ole kenttiä (tyhjä sisalto.kentat).",
        });
        continue;
      }
      for (const [k, v] of Object.entries(kentat)) {
        const arvo = v?.arvo;
        if (arvo == null || String(arvo).trim() === "") {
          hylattavat.push({
            id: r.id,
            syy: `Korjauksessa kenttä ${k} ilman arvoa — tyhjennys vaatii kentta_tyhjennys-tyypin, ei tyhjää korjausta.`,
          });
          break;
        }
      }
    }

    if (r.tyyppi === "paatos") {
      const p = s.paatos as { lahteet?: unknown[] } | undefined;
      if (!Array.isArray(p?.lahteet) || p.lahteet.length === 0) {
        hylattavat.push({
          id: r.id,
          syy: "Paatos-ehdotuksesta puuttuu sisalto.paatos.lahteet-taulukko. Täydennä JSON ja lähetä uudelleen.",
        });
      }
    }

    if (r.tyyppi === "maaraaja") {
      const m = s.maaraaja as { tyyppi?: string; paattyy_pvm?: string; lahteet?: unknown[] } | undefined;
      if (!m?.tyyppi?.trim() || !m?.paattyy_pvm?.trim()) {
        hylattavat.push({
          id: r.id,
          syy: "Maaraaja-ehdotuksesta puuttuu tyyppi tai paattyy_pvm.",
        });
      } else if (!Array.isArray(m.lahteet) || m.lahteet.length === 0) {
        hylattavat.push({
          id: r.id,
          syy: "Maaraaja-ehdotuksesta puuttuu sisalto.maaraaja.lahteet-taulukko.",
        });
      }
    }
  }

  // Duplikaatti taydennys: sama hanke + sama kenttä + sama arvo
  const taydennys = (rows ?? []).filter((r) => r.tyyppi === "taydennys");
  const nakyneet = new Map<string, string>();
  for (const r of [...taydennys].sort((a, b) => a.luotu_pvm.localeCompare(b.luotu_pvm))) {
    const kentat = ((r.sisalto as Record<string, unknown>).kentat ?? {}) as Record<
      string,
      { arvo?: string }
    >;
    for (const [k, v] of Object.entries(kentat)) {
      const avain = `${r.hanke_id}:${k}:${v.arvo}`;
      if (nakyneet.has(avain)) {
        hylattavat.push({
          id: r.id,
          syy: `Duplikaatti täydennys (sama hanke/kenttä/arvo kuin ${nakyneet.get(avain)?.slice(0, 8)}).`,
        });
      } else {
        nakyneet.set(avain, r.id);
      }
    }
  }

  const uniikit = new Map<string, Hylkays>();
  for (const h of hylattavat) {
    if (!uniikit.has(h.id)) uniikit.set(h.id, h);
  }

  console.log(`Hylättäviä: ${uniikit.size}${kuiva ? " (kuiva-ajo)" : ""}`);
  for (const h of uniikit.values()) {
    console.log(`${h.id} — ${h.syy.slice(0, 100)}`);
    if (!kuiva) {
      const { error: updVirhe } = await sb
        .from("muutosehdotukset")
        .update({
          tila: "hylatty",
          kasitelty_pvm: new Date().toISOString(),
          kasittelija: KASITTELIJA,
          perustelu: h.syy,
        })
        .eq("id", h.id)
        .eq("tila", "odottaa");
      if (updVirhe) console.error(`  VIRHE ${h.id}: ${updVirhe.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
