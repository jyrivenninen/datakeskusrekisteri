import {
  DOKUMENTTI_KIELI_NIMET,
  DOKUMENTTI_LAJI_NIMET,
  DOKUMENTTI_MUOTO_NIMET,
  muotoilePvm,
} from "@/lib/naytto";
import type { Dokumentti, KenttaLahde } from "@/lib/supabase/tietokanta";

const STUB_DOKUMENTTI_ETUOSA = "00000000-0000-4000-8000-";

export function onStubDokumentti(dokumentti: Pick<Dokumentti, "id">): boolean {
  return dokumentti.id.startsWith(STUB_DOKUMENTTI_ETUOSA);
}

/** Julkinen arvio viimeisimmästä noudosta / rekisteröinnistä (ei dokumentti_tiivisteet). */
export function viimeisinAsiakirjaHakuPvm(
  dokumentti: Dokumentti,
  lahteet: KenttaLahde[],
): string | null {
  const lahdePvmet = lahteet
    .filter(
      (l) =>
        !l.tekninen_lahde &&
        l.taulu !== "dokumentit" &&
        (l.lahde_url === dokumentti.url || l.dokumentti_id === dokumentti.id),
    )
    .map((l) => l.vahvistettu_pvm.slice(0, 10));

  const maxLahde =
    lahdePvmet.length > 0
      ? lahdePvmet.sort((a, b) => a.localeCompare(b)).at(-1)!
      : null;

  if (!onStubDokumentti(dokumentti)) {
    const rekisteri =
      dokumentti.lahde_metatiedot_kasitelty_pvm?.slice(0, 10) ??
      dokumentti.paivitetty_pvm.slice(0, 10);
    if (rekisteri && rekisteri !== "1970-01-01") {
      if (!maxLahde || rekisteri >= maxLahde) return rekisteri;
    }
  }

  return maxLahde;
}

export function asiakirjaMetataInfo(d: {
  laji: Dokumentti["laji"];
  muoto: Dokumentti["muoto"];
  kieli: Dokumentti["kieli"];
  julkaisija: string | null;
  julkaistu_pvm: string | null;
  viimeisin_haku_pvm: string | null;
}): string {
  const osat: string[] = [DOKUMENTTI_LAJI_NIMET[d.laji]];
  if (d.muoto) osat.push(DOKUMENTTI_MUOTO_NIMET[d.muoto]);
  if (d.kieli) osat.push(DOKUMENTTI_KIELI_NIMET[d.kieli]);
  if (d.julkaisija) osat.push(d.julkaisija);
  if (d.julkaistu_pvm) osat.push(`Julkaistu ${muotoilePvm(d.julkaistu_pvm)}`);
  if (d.viimeisin_haku_pvm) osat.push(`Haettu ${muotoilePvm(d.viimeisin_haku_pvm)}`);
  return osat.join(" · ");
}
