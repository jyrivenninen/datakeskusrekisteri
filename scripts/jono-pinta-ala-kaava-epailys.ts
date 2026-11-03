/**
 * Vie kaava-alaa pinta_ala_ha-kentässä pitävät hankkeet läpikäyntijonoon
 * (muutosehdotukset, lainaukset näkyviin).
 *
 * Aja: npx tsx scripts/jono-pinta-ala-kaava-epailys.ts [--kuiva]
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const TUN = "pinta_ala_kaava_epailys";
const KAAVA_RE =
  /(asemakaava|yleiskaava|kaava[- ]?alue|kaavoitett|suunnittelualue|kaavoitusalue|korttelialue)/i;

async function main() {
  lataaPaikallinenYmparisto();
  const kuiva = process.argv.includes("--kuiva");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) throw new Error("Supabase-asetukset puuttuvat.");
  const sb = createClient(url, avain, { auth: { persistSession: false } });

  const { data: hankkeet, error: hErr } = await sb
    .from("hankkeet")
    .select("id, nimi, kunta, pinta_ala_ha, kaava_ala_ha")
    .eq("julkaistu", true)
    .is("yhdistetty_kohde_id", null)
    .not("pinta_ala_ha", "is", null)
    .is("kaava_ala_ha", null);
  if (hErr) throw new Error(hErr.message);

  const { data: lahteet, error: lErr } = await sb
    .from("kentta_lahteet")
    .select("id, rivi_id, lahde_url, lainaus, luottamus, merkitty")
    .eq("taulu", "hankkeet")
    .eq("kentta", "pinta_ala_ha")
    .neq("tila", "korvattu");
  if (lErr) throw new Error(lErr.message);

  const { data: jonossa, error: jErr } = await sb
    .from("muutosehdotukset")
    .select("hanke_id")
    .eq("ehdottaja_tunniste", TUN)
    .eq("tila", "odottaa");
  if (jErr) throw new Error(jErr.message);
  const jo = new Set((jonossa ?? []).map((r) => r.hanke_id));

  let lisatty = 0;
  let ohitettu = 0;
  for (const h of hankkeet ?? []) {
    const hLahteet = (lahteet ?? []).filter((l) => l.rivi_id === h.id);
    const kaavaLahteet = hLahteet.filter(
      (l) => l.lainaus && KAAVA_RE.test(l.lainaus) && !/kaavaillaan/i.test(l.lainaus),
    );
    if (kaavaLahteet.length === 0) continue;
    if (jo.has(h.id)) {
      ohitettu += 1;
      continue;
    }

    const lainausLista = kaavaLahteet
      .map(
        (l) =>
          `• ${l.luottamus}: «${(l.lainaus ?? "").slice(0, 280)}»\n  ${l.lahde_url}`,
      )
      .join("\n");

    const paalahde = kaavaLahteet[0]!;
    const rivi = {
      tyyppi: "korjaus",
      hanke_id: h.id,
      ehdottaja_tyyppi: "agentti",
      ehdottaja_tunniste: TUN,
      lahde_url: paalahde.lahde_url,
      huomautus:
        `Kaava-ala pinta_ala_ha-kentässä (${h.pinta_ala_ha} ha); kaava_ala_ha tyhjä. ` +
        `Tarkista lainauksesta onko kyse kaava-alueesta vai tontista.`,
      tila: "odottaa",
      sisalto: {
        kentat: {
          kaava_ala_ha: {
            arvo: h.pinta_ala_ha,
            lahde_url: paalahde.lahde_url,
            lahde_laji: "html",
            lainaus: paalahde.lainaus,
            luottamus: "epavarma",
            merkitty: "koneen_ehdottama",
          },
        },
        pinta_ala_kaava_epailys: {
          nykyinen_pinta_ala_ha: h.pinta_ala_ha,
          ehdotus: "Siirrä arvo kaava_ala_ha-kenttään tai jätä tontiksi; tyhjennä pinta_ala_ha tarvittaessa.",
          lahteet: kaavaLahteet.map((l) => ({
            lahde_id: l.id,
            lahde_url: l.lahde_url,
            lainaus: l.lainaus,
            luottamus: l.luottamus,
          })),
        },
      },
    };

    console.log(`\n${h.nimi} (${h.kunta}) — ${h.pinta_ala_ha} ha`);
    console.log(lainausLista);

    if (!kuiva) {
      const { error } = await sb.from("muutosehdotukset").insert(rivi);
      if (error) throw new Error(error.message);
      lisatty += 1;
    } else {
      lisatty += 1;
    }
  }

  console.log({ lisatty, ohitettu, kuiva });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
