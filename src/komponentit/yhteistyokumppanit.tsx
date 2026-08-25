import { YHTEISTYOKUMPPANIT } from "@/lib/yhteistyokumppanit";

export function Yhteistyokumppanit({
  otsikkoTaso = "h2",
  otsikkoId = "kumppanit-otsikko",
}: {
  otsikkoTaso?: "h2" | "h3" | "p";
  otsikkoId?: string;
}) {
  const otsikkoLuokka =
    otsikkoTaso === "p"
      ? "text-sm font-medium text-foreground"
      : otsikkoTaso === "h3"
        ? "text-lg font-semibold"
        : "text-xl font-semibold";
  const Otsikko = otsikkoTaso;

  return (
    <section aria-labelledby={otsikkoId}>
      <Otsikko id={otsikkoId} className={otsikkoLuokka}>
        Yhteistyökumppaneita
      </Otsikko>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-relaxed">
        {YHTEISTYOKUMPPANIT.map((kumppani) => (
          <li key={kumppani.url}>
            <a
              href={kumppani.url}
              className="text-link underline"
              rel="noopener noreferrer"
            >
              {kumppani.nimi}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
