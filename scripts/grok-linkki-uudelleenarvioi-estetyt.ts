/**
 * Grok-jatkotoimet: 33 historiallista linkki_rikki-havaintoa (estetty) mitätöidään
 * ja URL:t tarkistetaan uudelleen luokittelulla toimii | estetty | kuollut.
 *
 * Aja: npx tsx scripts/grok-linkki-uudelleenarvioi-estetyt.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import {
  luokitteleLinkkiTarkistus,
  tarkistaOsoite,
} from "../agents/tarkistukset/linkit";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const KASITTELIJA = "scripts/grok-linkki-uudelleenarvioi-estetyt";
const EHDOTTAJA = "agents/tarkistukset/linkit";

function alkuperainenLuokka(sisalto: unknown): string | null {
  const linkki = (sisalto as { linkki?: { http_tila: number | null; virhe: string | null } })
    ?.linkki;
  if (!linkki) return null;
  return luokitteleLinkkiTarkistus({
    http_tila: linkki.http_tila,
    virhe: linkki.virhe,
  });
}

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");

  const sb = createClient(url, avain, { auth: { persistSession: false } });
  const { data: rivit, error } = await sb
    .from("muutosehdotukset")
    .select("id, tila, lahde_url, sisalto, huomautus, hanke_id")
    .eq("tyyppi", "linkki_rikki")
    .eq("tila", "hyvaksytty");
  if (error) throw new Error(error.message);

  const estetyt = (rivit ?? []).filter((r) => alkuperainenLuokka(r.sisalto) === "estetty");
  let mitatoitu = 0;

  for (const rivi of estetyt) {
    const sisalto = (rivi.sisalto ?? {}) as Record<string, unknown>;
    const linkki = (sisalto.linkki ?? {}) as Record<string, unknown>;
    const uusiSisalto = {
      ...sisalto,
      linkki: {
        ...linkki,
        uudelleenarvio: {
          luokka_alkuperainen: "estetty",
          syy: "Bot-suojaus tai rate limit; ei URL-virhe. Havainto mitätöity.",
          uudelleenarvioitu_pvm: new Date().toISOString().slice(0, 10),
        },
      },
    };
    if (!kuiva) {
      const { error: updVirhe } = await sb
        .from("muutosehdotukset")
        .update({
          tila: "hylatty",
          kasittelija: KASITTELIJA,
          kasitelty_pvm: new Date().toISOString(),
          huomautus:
            "Uudelleenarvioitu: estetty (401/403/429/5xx), ei rikkinäinen linkki. Alkuperäinen käsittely peruttu.",
          sisalto: uusiSisalto,
        })
        .eq("id", rivi.id);
      if (updVirhe) throw new Error(updVirhe.message);
    }
    mitatoitu += 1;
  }

  const urlit = [...new Set(estetyt.map((r) => r.lahde_url).filter(Boolean))] as string[];
  const tulokset = { toimii: 0, estetty: 0, kuollut: 0 };
  const kuolleet: string[] = [];
  const viiveMs = 1000;

  for (const osoite of urlit) {
    await new Promise((r) => setTimeout(r, viiveMs));
    const t = await tarkistaOsoite(osoite);
    const luokka = luokitteleLinkkiTarkistus(t);
    tulokset[luokka] += 1;
    console.log(`${luokka} ${t.http_tila ?? "—"} ${osoite}`);

    if (luokka === "kuollut" && !kuiva) {
      const { data: odottaa } = await sb
        .from("muutosehdotukset")
        .select("id")
        .eq("tyyppi", "linkki_rikki")
        .eq("lahde_url", osoite)
        .eq("tila", "odottaa")
        .limit(1);
      if (!odottaa?.length) {
        const alkuperainen = estetyt.find((r) => r.lahde_url === osoite);
        const linkkiMeta = (alkuperainen?.sisalto as { linkki?: Record<string, unknown> })?.linkki;
        const { error: insVirhe } = await sb.from("muutosehdotukset").insert({
          tyyppi: "linkki_rikki",
          hanke_id: alkuperainen?.hanke_id ?? null,
          ehdottaja_tyyppi: "agentti",
          ehdottaja_tunniste: EHDOTTAJA,
          lahde_url: osoite,
          huomautus: `Uudelleentarkistus ${new Date().toISOString().slice(0, 10)}: HTTP ${t.http_tila ?? t.virhe ?? "virhe"}.`,
          tila: "odottaa",
          sisalto: {
            kentat: {},
            linkki: {
              url: osoite,
              http_tila: t.http_tila,
              vaste_ms: t.vaste_ms,
              virhe: t.virhe,
              taulu: linkkiMeta?.taulu ?? "dokumentit",
              rivi_id: linkkiMeta?.rivi_id ?? "",
              kentta: linkkiMeta?.kentta ?? "url",
              uudelleentarkistus: true,
            },
          },
        });
        if (insVirhe) throw new Error(insVirhe.message);
        kuolleet.push(osoite);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        kuiva,
        mitatoitu_havaintoa: mitatoitu,
        uudelleen_tarkistettu_url: urlit.length,
        luokittelu: tulokset,
        uusi_korjausjono_kuolleet: kuolleet.length,
        kuolleet_urlit: kuolleet,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
