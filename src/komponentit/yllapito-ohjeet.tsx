export function YllapitoOhjeet({ massahyvaksynta = false }: { massahyvaksynta?: boolean }) {
  return (
    <details className="mt-6 rounded border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
        Ohjeet
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4 text-sm leading-relaxed">
        <p>
          Jonossa on kahdenlaisia rivejä.{" "}
          <span className="rounded-sm border border-teal-800 bg-teal-100 px-1.5 py-0.5 font-medium text-teal-950 dark:border-teal-300 dark:bg-teal-950 dark:text-teal-50">
            Täydennys
          </span>{" "}
          (sinivihreä) julkaisee tietoja rekisteriin.{" "}
          <span className="rounded-sm border border-violet-800 bg-violet-100 px-1.5 py-0.5 font-medium text-violet-950 dark:border-violet-300 dark:bg-violet-950 dark:text-violet-50">
            Havainto
          </span>{" "}
          (violetti) merkitsee asian nähdyksi; se ei yleensä muuta hankesivua.
        </p>
        <section aria-labelledby="ohje-taydennys">
          <h2 id="ohje-taydennys" className="text-base font-semibold">
            Täydennykset, korjaukset, uudet hankkeet ja valokuvat
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Avaa rivi. Tarkista arvo, lähdeosoite ja lainaus. Tyhjä kenttä on
              parempi kuin arvattu.
            </li>
            <li>
              Hyväksyntä kirjoittaa tiedot julkaistuun hankkeeseen ja merkitsee
              ne ihmisen vahvistamiksi.
            </li>
            <li>Hylkäys jättää julkaisematta. Perustelu jää lokiin.</li>
            {massahyvaksynta ? (
              <li>
                <strong className="font-medium">Hyväksy kaikki odottavat</strong>{" "}
                julkaisee nämä rivit (ristiriitahavaintoja lukuun ottamatta).
                Käytä vain, kun olet käynyt sisällön läpi. Muilla ylläpitäjillä
                ei ole tätä nappia.
              </li>
            ) : null}
          </ul>
        </section>
        <section aria-labelledby="ohje-havainto">
          <h2 id="ohje-havainto" className="text-base font-semibold">
            Havainnot (linkki, Ryhti, kunta, YTJ, MML, dokumentti)
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Hyväksyntä merkitsee havainnon käsitellyksi. Se ei päivitä
              hankkeen faktakenttiä.
            </li>
            <li>
              Poikkeus: YTJ-havainto, jossa ehdotetaan Y-tunnusta, julkaisee
              tunnuksen organisaatiolle.
            </li>
            <li>
              Hylkäys poistaa rivin jonosta. Sama havainto voi nousta uudelleen
              seuraavassa ajossa.
            </li>
          </ul>
        </section>
        <section aria-labelledby="ohje-ristiriita">
          <h2 id="ohje-ristiriita" className="text-base font-semibold">
            Ristiriitahavainto
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Avaa rivi ja käsittele erikseen
              {massahyvaksynta
                ? "; massakäsittely ohittaa nämä rivit"
                : ""}
              .
            </li>
            <li>
              Jos havainto ei saa nousta uudelleen, kirjoita perustelu
              (vähintään 12 merkkiä) ja merkitse käsitellyksi.
            </li>
            <li>
              Hylkäys ei estä samaa havaintoa nousemasta myöhemmin.
            </li>
            <li>
              Kahden lähekkäisen hankkeen kohdalla voi yhdistää valittuun
              hankkeeseen: puuttuvat kentät ja lähteet siirtyvät, vanha kortti
              ohjataan uuteen. Rivejä ei poisteta.
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}
