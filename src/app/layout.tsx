import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
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
          <div className="mx-auto flex w-full max-w-5xl items-center px-4 py-4">
            <p className="text-sm font-medium">
              <a href="/" className="text-foreground no-underline hover:underline">
                Datakeskushankkeiden kansallinen rekisteri
              </a>
            </p>
            <nav className="ml-auto flex flex-wrap justify-end gap-4 text-sm">
              <a href="/opas/yva-mielipide" className="text-link underline">
                YVA-opas
              </a>
              <a href="/hakemisto" className="text-link underline">
                Hakemisto
              </a>
              <a href="/ilmoitus" className="text-link underline">
                Ilmoita hanke
              </a>
              <a href="/yllapito" className="text-link underline">
                Ylläpito
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-auto border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted">
            <p>Avoin hanketietokanta ja prosessiopas. Julkaistu tieto merkitään lähteineen.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
