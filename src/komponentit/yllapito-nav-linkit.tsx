"use client";

import { useEffect, useState } from "react";
import { luoSelainAsiakas } from "@/lib/supabase/asiakas";

function useOnkoYllapitaja(): boolean {
  const [nayta, asetaNayta] = useState(false);

  useEffect(() => {
    let peruttu = false;
    (async () => {
      try {
        const supabase = luoSelainAsiakas();
        const { data: istunto } = await supabase.auth.getSession();
        const uid = istunto.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase
          .from("yllapitajat")
          .select("kayttaja_id")
          .eq("kayttaja_id", uid)
          .maybeSingle();
        if (!peruttu && data) asetaNayta(true);
      } catch {
        /* julkinen oletus */
      }
    })();
    return () => {
      peruttu = true;
    };
  }, []);

  return nayta;
}

/** Navigaation Hakemisto-linkki (ennen Ilmoita hanke). */
export function YllapitoHakemistoNav() {
  if (!useOnkoYllapitaja()) return null;
  return (
    <a href="/hakemisto" className="text-link underline">
      Hakemisto
    </a>
  );
}

/** Navigaation Ylläpito-linkki (lopussa). */
export function YllapitoNav() {
  if (!useOnkoYllapitaja()) return null;
  return (
    <a href="/yllapito" className="text-link underline">
      Ylläpito
    </a>
  );
}

/** Etusivun organisaatiohakemisto-linkki vain ylläpitäjälle. */
export function YllapitoHakemistoLinkki() {
  if (!useOnkoYllapitaja()) return null;
  return (
    <>
      {" · "}
      <a href="/hakemisto" className="text-link underline">
        Organisaatio- ja yhteystietohakemisto
      </a>
    </>
  );
}
