export type KuntaRivi = { koodi: string; nimi: string };

export const RYHTI_HAKUEHTO_NIMET: Record<string, string> = {
  kaavatunnukset: "Haku hankkeen kaavatunnuksella",
  hakusanat: "Haku avainsanoilla (datakeskus, konesali, …)",
};

function normalisoiKaavatunnus(tunnus: string): string {
  return tunnus.trim().toLowerCase();
}

/** null = ei vertailtavissa (puuttuu toiselta puolelta). */
export function kaavatunnusTasmaa(
  hankeTunnus: string | null | undefined,
  ryhtiTunnus: string | null | undefined,
): boolean | null {
  const h = hankeTunnus?.trim();
  const r = ryhtiTunnus?.trim();
  if (!h || !r) return null;
  return normalisoiKaavatunnus(h) === normalisoiKaavatunnus(r);
}

export function kuntaNimetKoodeista(kunnat: readonly KuntaRivi[], koodit: string[]): string[] {
  return koodit.map((koodi) => {
    const pad = koodi.trim();
    const ilman = pad.replace(/^0+/, "") || "0";
    const loyty = kunnat.find((r) => {
      const rk = r.koodi.trim();
      const rkIlman = rk.replace(/^0+/, "") || "0";
      return rk === pad || rk === ilman || rkIlman === ilman;
    });
    return loyty?.nimi ?? `koodi ${koodi}`;
  });
}

/** null = ei vertailtavissa. */
export function kuntaTasmaa(
  hankeKunta: string | null | undefined,
  ryhtiKuntaNimet: string[],
): boolean | null {
  const h = hankeKunta?.trim();
  if (!h || ryhtiKuntaNimet.length === 0) return null;
  const hNorm = h.toLowerCase();
  return ryhtiKuntaNimet.some((k) => k.toLowerCase() === hNorm);
}

export function ryhtiVaroitukset(opts: {
  hankeKaavatunnus: string | null | undefined;
  ryhtiKaavatunnus: string | null | undefined;
  hankeKunta: string | null | undefined;
  ryhtiKuntaNimet: string[];
}): string[] {
  const varoitukset: string[] = [];
  const kt = kaavatunnusTasmaa(opts.hankeKaavatunnus, opts.ryhtiKaavatunnus);
  if (kt === false) {
    varoitukset.push(
      `Kaavatunnus ei täsmää (hankkeella «${opts.hankeKaavatunnus ?? "—"}», Ryhdissä «${opts.ryhtiKaavatunnus ?? "—"}»).`,
    );
  }
  const kuntaOk = kuntaTasmaa(opts.hankeKunta, opts.ryhtiKuntaNimet);
  if (kuntaOk === false) {
    varoitukset.push(
      `Kunta ei täsmää (hankkeella «${opts.hankeKunta ?? "—"}», Ryhdissä ${opts.ryhtiKuntaNimet.join(", ")}).`,
    );
  }
  if (kt === false && kuntaOk === false) {
    varoitukset.push(
      "Havainto vaikuttaa eri kaavalta — hylkää, jos se ei liity hankkeeseen.",
    );
  }
  return varoitukset;
}

export function ryhtiHylkaysPerusteluEhdotus(opts: {
  hankeNimi: string;
  ryhtiKaavatunnus: string | null | undefined;
  ryhtiNimi: string | null | undefined;
}): string {
  const tunnus = opts.ryhtiKaavatunnus ? ` (${opts.ryhtiKaavatunnus})` : "";
  const nimi = opts.ryhtiNimi ? ` «${opts.ryhtiNimi}»` : "";
  return `Eri kaava tai kunta — Ryhti-kohde${nimi}${tunnus} ei liity hankkeeseen ${opts.hankeNimi}.`;
}
