import {
  kattavuusSelite,
  kattavuusVariLuokka,
} from "@/lib/kattavuus";

type KattavuusOsoittajaProps = {
  merkitty: number;
  kaikki: number;
  className?: string;
};

/** Osoittaja (X) värillä kattavuuden mukaan. */
export function KattavuusOsoittaja({ merkitty, kaikki, className }: KattavuusOsoittajaProps) {
  return (
    <span
      className={[kattavuusVariLuokka(merkitty, kaikki), className].filter(Boolean).join(" ")}
      title={kattavuusSelite(merkitty, kaikki)}
    >
      {merkitty}
    </span>
  );
}

type KattavuusHankkeillaProps = {
  merkitty: number;
  kaikki: number;
};

/** «X/Y hankkeella merkitty» — osoittaja värillä. */
export function KattavuusHankkeilla({ merkitty, kaikki }: KattavuusHankkeillaProps) {
  return (
    <>
      <KattavuusOsoittaja merkitty={merkitty} kaikki={kaikki} />
      /{kaikki} hankkeella merkitty
    </>
  );
}

type KattavuusHankkeitaProps = {
  merkitty: number;
  kaikki: number;
};

/** «X/Y hanketta merkitty» — osoittaja värillä. */
export function KattavuusHankkeita({ merkitty, kaikki }: KattavuusHankkeitaProps) {
  return (
    <>
      <KattavuusOsoittaja merkitty={merkitty} kaikki={kaikki} />
      /{kaikki} hanketta merkitty
    </>
  );
}
