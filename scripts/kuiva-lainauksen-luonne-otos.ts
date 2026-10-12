/**
 * Kuiva: montako viranomaislähderivää näyttää heuristiikalla
 * valmisteluteksti- tai esitystyyppiseltä. Ei kirjoita.
 */
import { createClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "../agents/ymparisto";
import { luokitteleLainauksenLuonne } from "../src/lib/lainauksen-luonne";
import { VARMISTAVAT_LAHDE_TYYPIT } from "../src/lib/kentta-varmistus";

async function main() {
  lataaPaikallinenYmparisto();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const urlTyypit = new Map<string, string>();
  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("dokumentit")
      .select("url, lahde_tyyppi")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const d of data) urlTyypit.set(d.url, d.lahde_tyyppi);
    if (data.length < 1000) break;
  }

  const varm = new Set<string>(VARMISTAVAT_LAHDE_TYYPIT);
  let viranomais = 0;
  let esitys = 0;
  let valmistelu = 0;
  let paatososa = 0;
  let eiLuokkaa = 0;
  const esimerkit: Array<{
    luokka: string;
    kentta: string;
    lainaus: string;
    url: string;
  }> = [];

  for (let alku = 0; ; alku += 1000) {
    const { data, error } = await sb
      .from("kentta_lahteet")
      .select("kentta, lainaus, lahde_url, tila, tekninen_lahde")
      .range(alku, alku + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) {
      if (r.tila === "korvattu" || r.tila === "ei_tue" || r.tekninen_lahde) {
        continue;
      }
      const tyyppi = urlTyypit.get(r.lahde_url);
      if (!tyyppi || !varm.has(tyyppi)) continue;
      viranomais += 1;
      const luokka = luokitteleLainauksenLuonne(r.lainaus);
      if (luokka === "esitys") {
        esitys += 1;
        if (esimerkit.length < 8) {
          esimerkit.push({
            luokka,
            kentta: r.kentta,
            lainaus: (r.lainaus ?? "").slice(0, 140),
            url: r.lahde_url,
          });
        }
      } else if (luokka === "valmisteluteksti") {
        valmistelu += 1;
        if (esimerkit.length < 8) {
          esimerkit.push({
            luokka,
            kentta: r.kentta,
            lainaus: (r.lainaus ?? "").slice(0, 140),
            url: r.lahde_url,
          });
        }
      } else if (luokka === "paatososa") paatososa += 1;
      else eiLuokkaa += 1;
    }
    if (data.length < 1000) break;
  }

  console.log(
    JSON.stringify(
      {
        viranomais_lahderivija: viranomais,
        heuristiikka: {
          esitys,
          valmisteluteksti: valmistelu,
          paatososa,
          ei_luokkaa: eiLuokkaa,
          esitys_tai_valmistelu: esitys + valmistelu,
        },
        huomio:
          "Heuristiikka lainauksen tekstistä. Ei kirjoiteta; valo/varmistus ennallaan.",
        esimerkit,
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
