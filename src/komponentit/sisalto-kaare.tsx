import type { ReactNode } from "react";

/** Sisältögridin lapset (#sisalto-sisaltokaare). Leveät lohkot: luokka sisalto-levea. */
export function SisaltoKaare({ children }: { children: ReactNode }) {
  return <div id="sisalto-sisaltokaare">{children}</div>;
}
