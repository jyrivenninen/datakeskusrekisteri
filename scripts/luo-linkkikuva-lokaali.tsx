/**
 * Luo linkkijakoon sopivan thumbnailin (ei gitiin). Aja: npx tsx scripts/luo-linkkikuva-lokaali.tsx
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const SINI = "#1e3a8a";
const TAUSTA = "#f4f1ea";

const Solut = [
  { sarake: 0, rivi: 0 },
  { sarake: 0, rivi: 1 },
  { sarake: 0, rivi: 2 },
  { sarake: 1, rivi: 1 },
  { sarake: 2, rivi: 1 },
] as const;

function ruudukkoSolut(soluKoko: number, vali: number) {
  const alku = 0;
  return Solut.map(({ sarake, rivi }) => ({
    left: alku + sarake * (soluKoko + vali),
    top: alku + rivi * (soluKoko + vali),
    koko: soluKoko,
  }));
}

function Ruudukko({
  soluKoko,
  vali,
}: {
  soluKoko: number;
  vali: number;
}) {
  const palat = ruudukkoSolut(soluKoko, vali);
  const leveys = 3 * soluKoko + 2 * vali;
  const korkeus = leveys;
  return (
    <div
      style={{
        display: "flex",
        width: leveys,
        height: korkeus,
        position: "relative",
      }}
    >
      {palat.map((pala, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: pala.left,
            top: pala.top,
            width: pala.koko,
            height: pala.koko,
            background: SINI,
          }}
        />
      ))}
    </div>
  );
}

async function tallennaPng(
  polku: string,
  leveys: number,
  korkeus: number,
  soluKoko: number,
  vali: number,
) {
  const vastaus = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: TAUSTA,
        }}
      >
        <Ruudukko soluKoko={soluKoko} vali={vali} />
      </div>
    ),
    { width: leveys, height: korkeus },
  );
  const tavut = Buffer.from(await vastaus.arrayBuffer());
  await writeFile(polku, tavut);
}

async function main() {
  const kansio = join(process.cwd(), "lokaali");
  await mkdir(kansio, { recursive: true });

  await tallennaPng(join(kansio, "rekisteri-linkkikuva-1200x630.png"), 1200, 630, 72, 24);
  await tallennaPng(join(kansio, "rekisteri-linkkikuva-512.png"), 512, 512, 64, 20);

  console.log(`Tallennettu:\n  ${kansio}/rekisteri-linkkikuva-1200x630.png (Open Graph / someen linkkiin)\n  ${kansio}/rekisteri-linkkikuva-512.png (neliö, esim. some)`);
}

main().catch((virhe) => {
  console.error(virhe instanceof Error ? virhe.message : virhe);
  process.exit(1);
});
