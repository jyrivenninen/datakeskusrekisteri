import type { Metadata } from "next";
import { YHTEISTYOKUMPPANIT } from "@/lib/yhteistyokumppanit";

export const metadata: Metadata = {
  title: "Yhteistyökumppaneita – Datakeskushankkeiden kansallinen rekisteri",
  description: "Rekisterin yhteistyökumppanit.",
};

export default function YhteistyokumppanitSivu() {
  const kumppanit = [...YHTEISTYOKUMPPANIT].sort((a, b) =>
    a.nimi.localeCompare(b.nimi, "fi"),
  );

  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Yhteistyökumppaneita</h1>
      <p className="mt-4 leading-relaxed text-muted">
        Rekisterin yhteistyökumppanit. Linkki avaa toimijan oman sivuston.
        Listaa täydennetään.
      </p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {kumppanit.map((kumppani) => (
          <li key={kumppani.url} className="py-4">
            <p className="font-medium">{kumppani.nimi}</p>
            <p className="mt-1 text-sm">
              <a
                href={kumppani.url}
                className="text-link underline"
                rel="noopener noreferrer"
              >
                {kumppani.url.replace(/^https:\/\//, "").replace(/\/$/, "")}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
