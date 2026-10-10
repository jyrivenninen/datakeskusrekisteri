import { karttapisteNakyy, projisoiKartta, suomiPolku, type OgKarttapiste } from "@/lib/og-suomi";
import { OG_KORKEUS, OG_LEVEYS, SIVUSTON_NIMI } from "@/lib/sivuston-metatiedot";

export function OgKortti({
  otsikko,
  kuvaus,
  alaviite,
  pisteet,
  korostus,
}: {
  otsikko: string;
  kuvaus: string;
  alaviite: string;
  pisteet: OgKarttapiste[];
  korostus?: OgKarttapiste | null;
}) {
  const karttaLeveys = 440;
  const karttaKorkeus = 560;
  const nakyvat = pisteet.filter((p) => karttapisteNakyy(p.lat, p.lon));
  const oma =
    korostus && karttapisteNakyy(korostus.lat, korostus.lon) ? korostus : null;

  return (
    <div
      style={{
        width: OG_LEVEYS,
        height: OG_KORKEUS,
        display: "flex",
        background: "#f4f1ea",
        color: "#1c1917",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 700,
          padding: "52px 56px",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", fontSize: 22, color: "#44403c" }}>{SIVUSTON_NIMI}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: otsikko.length > 42 ? 46 : 56,
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: -0.5,
            }}
          >
            {otsikko}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 22,
              fontSize: 26,
              lineHeight: 1.35,
              color: "#44403c",
            }}
          >
            {kuvaus}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#44403c" }}>{alaviite}</div>
      </div>
      <div
        style={{
          display: "flex",
          width: 500,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={karttaLeveys} height={karttaKorkeus} viewBox={`0 0 ${karttaLeveys} ${karttaKorkeus}`}>
          <path d={suomiPolku(karttaLeveys, karttaKorkeus)} fill="#e7e5e4" stroke="#1c1917" strokeWidth={2} />
          {nakyvat.map((piste, i) => {
            const { x, y } = projisoiKartta(piste.lon, piste.lat, karttaLeveys, karttaKorkeus);
            return <circle key={i} cx={x} cy={y} r={4.5} fill="#1e3a8a" />;
          })}
          {oma ? (
            <circle
              cx={projisoiKartta(oma.lon, oma.lat, karttaLeveys, karttaKorkeus).x}
              cy={projisoiKartta(oma.lon, oma.lat, karttaLeveys, karttaKorkeus).y}
              r={9}
              fill="#c2410c"
              stroke="#fffcf7"
              strokeWidth={3}
            />
          ) : null}
        </svg>
      </div>
    </div>
  );
}
