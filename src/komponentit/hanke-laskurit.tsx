import { muotoileLuku, muotoileVaihtelvali } from "@/lib/naytto";
import type { HankeYhteenveto } from "@/lib/hanke-yhteenveto";
import {
  SUOMI_SAHKON_TUOTANTO_2024,
  SUOMI_SAHKONTUOTANTO_CO2_2024,
} from "@/lib/suomi-energia";

function kattavuus(merkitty: number, kaikki: number): string {
  return `${merkitty}/${kaikki} hankkeella merkitty`;
}

function muotoileProsentti(osuus: number): string {
  const prosentti = osuus * 100;
  const desimaalit = prosentti < 1 ? 2 : 1;
  return `${new Intl.NumberFormat("fi-FI", {
    maximumFractionDigits: desimaalit,
    minimumFractionDigits: 0,
  }).format(prosentti)} %`;
}

function muotoileProsenttivali(min: number | null, max: number | null): string {
  if (min == null || max == null) return "Ei laskettavissa";
  if (min === max) return muotoileProsentti(min);
  return `${muotoileProsentti(min)}–${muotoileProsentti(max)}`;
}

export function HankeLaskurit({ yhteenveto }: { yhteenveto: HankeYhteenveto }) {
  const { hankeita } = yhteenveto;
  const sahkoTeksti =
    yhteenveto.sahkonkayttoMerkittyLkm === 0
      ? "Ei merkitty"
      : muotoileVaihtelvali(
          yhteenveto.sahkonkayttoTwhMin,
          yhteenveto.sahkonkayttoTwhMax,
          "TWh/a",
        );
  const osuusTeksti = muotoileProsenttivali(
    yhteenveto.osuusSuomenTuotannostaMin,
    yhteenveto.osuusSuomenTuotannostaMax,
  );
  const co2Teksti =
    yhteenveto.co2TMin == null || yhteenveto.co2TMax == null
      ? "Ei laskettavissa"
      : muotoileVaihtelvali(yhteenveto.co2TMin, yhteenveto.co2TMax, "t CO₂/a");

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold">Valittujen hankkeiden luvut</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Summat koskevat vain suodattimeen osuvia julkaistuja hankkeita. Tyhjä
        kenttä ei ole nolla. Jos hankkeella on merkittyjä YVA-vaihtoehtoja,
        laskuri käyttää niiden alinta ja ylintä lukua; vaihtoehtoja ei lasketa
        yhteen.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li className="rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">Hankkeita</p>
          <p
            key={hankeita}
            className="mt-1 text-2xl font-semibold tabular-nums motion-safe:transition-opacity motion-safe:duration-200"
          >
            {hankeita}
          </p>
          <p className="mt-1 text-sm text-muted">
            {yhteenveto.kuntia} kuntaa · {yhteenveto.rakenteillaTaiToiminnassaLkm}{" "}
            rakenteilla tai toiminnassa
          </p>
        </li>
        <li className="rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">Arvioitu sähkönkäyttö</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{sahkoTeksti}</p>
          <p className="mt-1 text-sm text-muted">
            {kattavuus(yhteenveto.sahkonkayttoMerkittyLkm, hankeita)}. Osuus
            Suomen sähköntuotannosta {SUOMI_SAHKON_TUOTANTO_2024.vuosi}:{" "}
            <span className="text-foreground">{osuusTeksti}</span> (
            {muotoileLuku(SUOMI_SAHKON_TUOTANTO_2024.twh)} TWh).
          </p>
        </li>
        <li className="rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">Arvio verkkosähkön CO₂-päästöistä</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{co2Teksti}</p>
          <p className="mt-1 text-sm text-muted">
            Kerroin {SUOMI_SAHKONTUOTANTO_CO2_2024.g_co2_kwh} g CO₂/kWh
            (sähköntuotannon keskiarvo, ei hankekohtainen). Vain hankkeet,
            joilla sähkönkäyttö on merkitty.
          </p>
        </li>
        <li className="rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">IT-teho tai teho</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {yhteenveto.tehoMerkittyLkm === 0
              ? "Ei merkitty"
              : muotoileVaihtelvali(yhteenveto.tehoMwMin, yhteenveto.tehoMwMax, "MW")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {kattavuus(yhteenveto.tehoMerkittyLkm, hankeita)}. IT-teho, jos
            merkitty, muuten teho. Generaattorin polttoainetehoa ei käytetä.
          </p>
        </li>
        <li className="rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">Pinta-ala</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {yhteenveto.pintaAlaMerkittyLkm === 0
              ? "Ei merkitty"
              : muotoileVaihtelvali(
                  yhteenveto.pintaAlaHaMin,
                  yhteenveto.pintaAlaHaMax,
                  "ha",
                )}
          </p>
          <p className="mt-1 text-sm text-muted">
            {kattavuus(yhteenveto.pintaAlaMerkittyLkm, hankeita)}
          </p>
        </li>
        <li className="rounded border border-border bg-surface p-4">
          <p className="text-sm text-muted">Varavoimageneraattorit</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {yhteenveto.generaattoritMerkittyLkm === 0
              ? "Ei merkitty"
              : muotoileVaihtelvali(
                  yhteenveto.generaattoritLkmMin,
                  yhteenveto.generaattoritLkmMax,
                  "kpl",
                )}
          </p>
          <p className="mt-1 text-sm text-muted">
            {kattavuus(yhteenveto.generaattoritMerkittyLkm, hankeita)}
          </p>
        </li>
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Vertailuluvut:{" "}
        <a
          href={SUOMI_SAHKON_TUOTANTO_2024.lahde_url}
          className="text-link underline"
        >
          {SUOMI_SAHKON_TUOTANTO_2024.lahde_nimi}
        </a>
        {" · "}
        <a
          href={SUOMI_SAHKONTUOTANTO_CO2_2024.lahde_url}
          className="text-link underline"
        >
          {SUOMI_SAHKONTUOTANTO_CO2_2024.lahde_nimi}
        </a>
        . Sähkönkäyttöä ei lasketa megawateista.
      </p>
    </div>
  );
}
