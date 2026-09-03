import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ESIVERSIO_EVASTE } from "@/lib/esiversio";
import { EsiversioIlmoitus } from "@/komponentit/esiversio-ilmoitus";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Datakeskushankkeiden kansallinen rekisteri",
  description:
    "Avoin hanketietokanta ja prosessiopas Suomessa vireillä olevista datakeskushankkeista, niiden etenemisestä ja määräajoista.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const evasteet = await cookies();
  const esiversioKuitattu = evasteet.get(ESIVERSIO_EVASTE)?.value === "kylla";

  return (
    <html
      lang="fi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a
          href="#sisalto"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-3 focus:py-2 focus:text-foreground focus:underline"
        >
          Siirry sisältöön
        </a>
        <header className="border-b border-border">
          <div className="sivuleveys flex items-center py-4">
            <p className="text-sm font-medium">
              <a href="/" className="text-foreground no-underline hover:underline">
                Datakeskushankkeiden kansallinen rekisteri
              </a>
              <span className="mt-1 block text-xs font-normal text-muted">
                Esiversio · tietoja täydennetään
              </span>
            </p>
            <nav className="ml-auto flex flex-wrap justify-end gap-4 text-sm">
              <a href="/opas/yva-mielipide" className="text-link underline">
                YVA-opas
              </a>
              <a href="/tietoa" className="text-link underline">
                Tietoa
              </a>
              <a href="/hakemisto" className="text-link underline">
                Hakemisto
              </a>
              <a href="/ilmoitus" className="text-link underline">
                Ilmoita hanke
              </a>
              <a href="/yhteys" className="text-link underline">
                Yhteys
              </a>
              <a href="/yllapito" className="text-link underline">
                Ylläpito
              </a>
            </nav>
          </div>
        </header>
        {esiversioKuitattu ? null : <EsiversioIlmoitus />}
        {children}
        <footer className="mt-auto border-t border-border bg-surface">
          <div className="sivuleveys grid gap-8 py-10 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-medium text-foreground">
                Datakeskushankkeiden kansallinen rekisteri
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Avoin hanketietokanta ja prosessiopas. Julkaistu tieto merkitään
                lähteineen. Esiversio: tietoja täydennetään ja varmennetaan.
              </p>
            </div>
            <nav aria-label="Alatunniste" className="flex flex-col gap-2 text-sm sm:items-end">
              <a href="/tietoa" className="text-link underline">
                Tietoa palvelusta
              </a>
              <a href="/yhteistyokumppanit" className="text-link underline">
                Yhteistyökumppaneita
              </a>
              <a href="/yhteys" className="text-link underline">
                Ota yhteyttä
              </a>
              <a href="/ilmoitus" className="text-link underline">
                Ilmoita hanke
              </a>
              <a href="/opas/yva-mielipide" className="text-link underline">
                YVA-opas
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
