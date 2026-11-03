/**
 * Poistaa julkaisemattoman Regant Oy -duplikaatin (ei Y-tunnusta), jos sillä ei ole viitteitä.
 * Aja: npx tsx scripts/siivoa-regant-duplikaatti-organisaatio.ts
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

const DUPLIKAATTI_ID = "98626314-78c9-4dda-936f-3d06d853e80d";

async function main() {
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase-ympäristö puuttuu");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: org, error: orgVirhe } = await sb
    .from("organisaatiot")
    .select("id, nimi, y_tunnus, julkaistu")
    .eq("id", DUPLIKAATTI_ID)
    .maybeSingle();
  if (orgVirhe) throw orgVirhe;
  if (!org) {
    console.log("Duplikaattia ei löydy — jo siivottu.");
    return;
  }
  if (org.julkaistu || org.y_tunnus) {
    throw new Error("Kohde ei ole odotettu julkaisematon duplikaatti — keskeytetään.");
  }

  const taulut: { nimi: string; sarake: string }[] = [
    { nimi: "hankkeet", sarake: "toimija_organisaatio_id" },
    { nimi: "hanke_organisaatiot", sarake: "organisaatio_id" },
    { nimi: "paatokset", sarake: "organisaatio_id" },
  ];

  for (const { nimi, sarake } of taulut) {
    const { count, error } = await sb
      .from(nimi)
      .select("id", { count: "exact", head: true })
      .eq(sarake, DUPLIKAATTI_ID);
    if (error) throw error;
    if (count && count > 0) {
      throw new Error(`${nimi}: ${count} viitettä — ei poisteta.`);
    }
  }

  const { error: poistoVirhe } = await sb.from("organisaatiot").delete().eq("id", DUPLIKAATTI_ID);
  if (poistoVirhe) throw poistoVirhe;
  console.log("Poistettu julkaisematon Regant Oy -duplikaatti:", DUPLIKAATTI_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
