import { RYHTI_KATTAVUUS } from "@/lib/ryhti-kattavuus";

export function RyhtiKattavuus({ luokka = "" }: { luokka?: string }) {
  return (
    <p className={`max-w-prose text-sm leading-relaxed text-muted ${luokka}`.trim()}>
      {RYHTI_KATTAVUUS}{" "}
      <a
        href="https://ryhti.syke.fi/palvelut/palvelut-tiedon-hyodyntajille/"
        className="text-link underline"
        rel="noopener noreferrer"
      >
        Ryhti, tiedon hyödyntäjät
      </a>
    </p>
  );
}
