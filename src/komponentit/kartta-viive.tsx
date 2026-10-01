"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { Kartta } from "@/komponentit/kartta";

const KarttaLadattu = dynamic(() => import("@/komponentit/kartta").then((mod) => mod.Kartta), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center px-1 text-sm" role="status">
      Kartta latautuu…
    </p>
  ),
});

/** Karttakirjasto ladataan vasta kun kartta piirretään. */
export function KarttaViive(props: ComponentProps<typeof Kartta>) {
  return <KarttaLadattu {...props} />;
}
