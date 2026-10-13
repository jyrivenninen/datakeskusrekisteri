"use client";

import { useEffect, useState } from "react";
import { EsiversioIlmoitus } from "@/komponentit/esiversio-ilmoitus";
import { ESIVERSIO_EVASTE } from "@/lib/esiversio";

/**
 * Näyttää esiversioilmoituksen vain jos evästettä ei ole.
 * Lukee evästeen selaimessa, jotta juurilayout ei kutsu cookies()-funktiota.
 */
export function EsiversioPortti() {
  const [nayta, asetaNayta] = useState(false);

  useEffect(() => {
    const kuitattu = document.cookie
      .split(";")
      .map((o) => o.trim())
      .some((o) => o === `${ESIVERSIO_EVASTE}=kylla`);
    asetaNayta(!kuitattu);
  }, []);

  if (!nayta) return null;
  return <EsiversioIlmoitus />;
}
