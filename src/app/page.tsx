export default function Etusivu() {
  return (
    <main id="sisalto" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        Datakeskushankkeiden kansallinen rekisteri
      </h1>
      <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">
        Avoin hanketietokanta ja prosessiopas. Tänne kootaan Suomessa vireillä
        olevat datakeskushankkeet, niiden eteneminen, määräajat ja niihin
        liittyvä tietotaito.
      </p>

      <section className="mt-8 rounded-md border border-border bg-surface p-5" aria-labelledby="mita-otsikko">
        <h2 id="mita-otsikko" className="text-xl font-semibold">
          Mitä rekisteri tarjoaa
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed">
          <li>hankkeet, niiden sijainti ja vaihe</li>
          <li>
            vaikuttamisen määräajat, kuten YVA-mielipiteet, kaavamuistutukset
            ja valitusajat
          </li>
          <li>yhteyshenkilöt, järjestöt ja viranomaistahot</li>
          <li>lähteistetty tieto, saatavilla myös koneluettavana</li>
        </ul>
      </section>

      <p className="mt-8 max-w-prose leading-relaxed">
        Sivusto on rakenteilla. Julkaistu tieto merkitään lähteineen. Rekisteri
        ei ota kantaa yksittäisiin hankkeisiin.
      </p>
    </main>
  );
}
