import { revalidatePath } from "next/cache";

/**
 * Ylläpitäjän julkaisun jälkeen: julkiset revalidate-reitit.
 * Etusivu/määräajat/muutokset/kartta/hanke: 60 s; kunnat/JSON/RSS/CSV/data: 300 s.
 */
export function revalidateJulkinenSisalto(opts?: {
  hankeId?: string | null;
  kuntaSlug?: string | null;
}) {
  revalidatePath("/");
  revalidatePath("/maaraajat");
  revalidatePath("/muutokset");
  revalidatePath("/kartta");
  revalidatePath("/data/hankkeet.json");
  revalidatePath("/data/hankkeet.csv");
  revalidatePath("/data/hankkeet.gpkg");
  revalidatePath("/muutokset/rss");
  revalidatePath("/muutokset/json");
  revalidatePath("/hakemisto");
  revalidatePath("/kunnat");

  if (opts?.hankeId) {
    revalidatePath(`/hankkeet/${opts.hankeId}`);
    revalidatePath(`/hankkeet/${opts.hankeId}/json`);
  } else {
    revalidatePath("/hankkeet", "layout");
  }

  if (opts?.kuntaSlug) {
    revalidatePath(`/kunnat/${opts.kuntaSlug}`);
    revalidatePath(`/kunnat/${opts.kuntaSlug}/json`);
    revalidatePath(`/kunnat/${opts.kuntaSlug}/rss`);
  }
}
