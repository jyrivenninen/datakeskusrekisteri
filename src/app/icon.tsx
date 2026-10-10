import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const SINI = "#1e3a8a";

/** Tab-kuvake: 3×3 ruudukon risti (PNG, ei kilpaile favicon.ico:n kanssa). */
export default function Icon() {
  const solu = 6;
  const vali = 2;
  const alku = 4;
  const koord = (sarake: number, rivi: number) => ({
    left: alku + sarake * (solu + vali),
    top: alku + rivi * (solu + vali),
  });
  const solut: { sarake: number; rivi: number }[] = [
    { sarake: 0, rivi: 0 },
    { sarake: 0, rivi: 1 },
    { sarake: 0, rivi: 2 },
    { sarake: 1, rivi: 1 },
    { sarake: 2, rivi: 1 },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "transparent",
        }}
      >
        {solut.map(({ sarake, rivi }) => {
          const { left, top } = koord(sarake, rivi);
          return (
            <div
              key={`${sarake}-${rivi}`}
              style={{
                position: "absolute",
                left,
                top,
                width: solu,
                height: solu,
                background: SINI,
              }}
            />
          );
        })}
      </div>
    ),
    { ...size },
  );
}
