/**
 * Luo agentti-roolin JWT Supabase PostgRESTiin.
 * Vaatii SUPABASE_JWT_SECRET (.env.local, Dashboard → Settings → API → JWT Secret).
 * Älä liitä salaisuuksia chattiin.
 */
import { createHmac } from "node:crypto";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";

function base64url(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function allekirjoitaJwt(payload: Record<string, unknown>, salaisuus: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const allekirjoitus = createHmac("sha256", salaisuus)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${allekirjoitus}`;
}

function main() {
  lataaPaikallinenYmparisto();
  const salaisuus = process.env.SUPABASE_JWT_SECRET;
  if (!salaisuus) {
    throw new Error(
      "SUPABASE_JWT_SECRET puuttuu. Lisää se .env.local-tiedostoon (Supabase Dashboard → Settings → API → JWT Secret). Älä liitä arvoa chattiin.",
    );
  }

  const vuosia = Number(process.env.AGENTTI_JWT_VUOSIA ?? "1");
  const kestoVuosina = Number.isFinite(vuosia) && vuosia > 0 ? vuosia : 1;
  const nyt = Math.floor(Date.now() / 1000);
  const exp = nyt + Math.floor(kestoVuosina * 365.25 * 24 * 60 * 60);

  const jwt = allekirjoitaJwt(
    {
      role: "agentti",
      iss: "supabase",
      iat: nyt,
      exp,
    },
    salaisuus,
  );

  console.log("Agentti-JWT luotu (role=agentti).");
  console.log("Tallenna .env.local-tiedostoon:");
  console.log(`SUPABASE_AGENTTI_KEY=${jwt}`);
  console.log("");
  console.log("Grok-botille kolme muuttujaa:");
  console.log("  NEXT_PUBLIC_SUPABASE_URL");
  console.log("  NEXT_PUBLIC_SUPABASE_ANON_KEY  (apikey-header)");
  console.log("  SUPABASE_AGENTTI_KEY           (Authorization: Bearer)");
  console.log("");
  console.log("Älä käytä agentti-JWT:tä apikey-headerissa — se antaa 401.");
  console.log("Testaa: npm run agentti:testaa-yhteys");
  console.log(`Voimassa noin ${kestoVuosina} vuotta (exp=${exp}).`);
}

main();
