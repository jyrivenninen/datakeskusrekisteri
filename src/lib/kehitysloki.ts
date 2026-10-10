/** Julkinen kehitysloki. Uusin merkintä ensin. */

export type KehityslokiMerkinta = {
  pvm: string;
  otsikko: string;
  johdanto?: string;
  kohdat: string[];
};

export const KEHITYSLOKI: KehityslokiMerkinta[] = [
  {
    pvm: "2026-10-10",
    otsikko: "Asiakirjojen siivous ja oncloudos-otsikot",
    kohdat: [
      "YVA-sivujen lyhyet alias-URL:t (Sarvenmaa, Pyhäjoki) linkitetty kanoniseen fi-polkuun.",
      "Rikkinäiset lähde-URL:t (404/500) siirretty ennen dokumenttirivien poistoa; Järviseudun sanomat ja WFS-otsikot korjattu.",
      "Dynasty/oncloudos-liitteille otsikko voidaan johtaa emo-asiakirjasta, kun PDF on kartta ilman tekstikerrosta.",
    ],
  },
  {
    pvm: "2026-10-10",
    otsikko: "Asiakirjat, yksityisyys ja lähdehygienia",
    kohdat: [
      "Hankesivun Asiakirjat-lista näyttää kaikki faktalähde-URL:t taulukkona (otsikko, tyyppi, haettu, kentät). Geokoodaus- ja OpenStreetMap-haut jätetään pois.",
      "Asiakirjan otsikossa ei näytetä vahingossa poimittuja yhteystietoja (esim. PDF:n puhelinnumerot).",
      "Sama asiakirja eri URL:llä yhdistyy yhdeksi riviksi; alias merkitään dokumenttirekisterissä kanoniseen riviin.",
      "Tietoa-sivulle lisätty huomio kuntien päätösjärjestelmien ja rakennuslupien kattavuudesta.",
      "Yksityisyys-osion teksti täsmennetty evästeistä, sivulatauksista ja karttalaatoista.",
      "Yli 12 kuukautta vanhat lomakeviestit poistetaan kuukausittain ajastetulla ajolla (GitHub Actions, loki lahdeajot-taulussa).",
    ],
  },
  {
    pvm: "2026-10-07",
    otsikko: "Ylläpitäjä- ja rahoitustiedot",
    kohdat: [
      "Tietoa-sivulle julkaistiin osio Kuka ylläpitää: ylläpitäjä, rahoitus ja suunniteltu yhdistys.",
    ],
  },
  {
    pvm: "2026-10-01",
    otsikko: "Avoin data ja sivun lataus",
    johdanto:
      "30.9.2026 saadun palautteen pohjalta tehtiin seuraavat muutokset:",
    kohdat: [
      "CSV- ja JSON-aineisto kootaan yhdellä kyselyllä. Latauslinkki näyttää tekstin «Muodostetaan aineistoa…», kun tiedostoa valmistellaan.",
      "Rekisterin voi ladata GeoPackagena (pisteet, hankealueet ja johtoreitit, EPSG:4326) JSON:n ja CSV:n rinnalla.",
      "Fingridin tuotantoluvut haetaan kerran tunnissa ja näytetään kartalla viimeisimmästä tallenteesta. Sivun lataus ei odota rajapintaa.",
      "Etusivu hakee hankelistan kerran. Karttakirjasto ladataan, kun kartta piirretään.",
    ],
  },
  {
    pvm: "2026-09-09",
    otsikko: "Yhteydenotto ja linkkitarkistus",
    kohdat: [
      "Yhteydenottolomake kerää aiheen ja viestin. Henkilönimeä ja sähköpostiosoitetta ei kysytä.",
      "Sama rikkinäinen lähdeosoite ei nosta uutta havaintoa, jos edellinen on jo jonossa.",
    ],
  },
  {
    pvm: "2026-09-08",
    otsikko: "Hankelista ja kartta",
    kohdat: [
      "Hankelistan voi järjestää nimen, tehon, sähkönkäytön, pinta-alan tai generaattorien mukaan.",
      "Kartan voi avata koko näytölle.",
      "Sähköasemat näkyvät kartalla omana kerroksena. Sijainnit ovat OpenStreetMapista, eivät Fingridin virallista liityntäaineistoa.",
    ],
  },
  {
    pvm: "2026-09-07",
    otsikko: "Avoin data ja lähteet",
    kohdat: [
      "Koko rekisterin JSON- ja CSV-lataus julkaistiin lisenssillä CC BY 4.0.",
      "Kuntien julkisia esityslistoja seurataan, kun lähdeosoite on tiedossa.",
      "Vanhentuneet lähteet nostetaan tarkistettavaksi koodilla.",
      "Kartalla voi verrata hankkeita maakunnan sähköntuotantoon (Energiateollisuus).",
    ],
  },
  {
    pvm: "2026-09-05",
    otsikko: "Maakunnat ja Fingrid kartalla",
    kohdat: [
      "Maakuntakerros näyttää hankkeiden lukumäärän, IT-tehon tai sähkönkäytön. Rajat ovat Tilastokeskukselta.",
      "Kartan vertailuun tuli Fingridin kokonaistuotanto ja tuotantotyypit (tuuli, ydin, vesi).",
      "Loitolla hanke näkyy pisteenä, lähellä nuppineulana. Keltainen halo kuvaa tehoa.",
    ],
  },
  {
    pvm: "2026-09-04",
    otsikko: "Määräajat ja kartan teho",
    kohdat: [
      "Etusivun tulevat määräajat haetaan ilman välimuistia. Päivämäärä on Suomen päivä.",
      "Kaavan osallistumis- ja arviointisuunnitelman sekä kaavaluonnoksen määräajat ovat omina tyypeinään.",
      "IT-tehon halo ja vaihekohtainen suodatin lisättiin kartan selitteeseen.",
    ],
  },
  {
    pvm: "2026-09-03",
    otsikko: "Haku ja päätökset",
    kohdat: [
      "Hankkeita voi hakea vapaalla sanalla. Suodattimet voi tyhjentää yhdellä linkillä.",
      "Viranomaispäätös tallennetaan omana tietonaan lähteineen.",
      "Hankelistassa näkyy vanhin kenttäkohtainen tarkistuspäivä.",
    ],
  },
  {
    pvm: "2026-08-25",
    otsikko: "Tietoa palvelusta ja tarkistukset",
    kohdat: [
      "Tietoa-sivu, esiversioilmoitus ja julkinen lähdeajojen loki.",
      "Yhteydenottolomake.",
      "Dokumenttien muuttuminen ja ristiriidat tarkistetaan koodilla. Havainto menee jonoon, ei suoraan julkaistuun tietoon.",
    ],
  },
  {
    pvm: "2026-08-24",
    otsikko: "Y-tunnukset ja lähdeajot",
    kohdat: [
      "Organisaation Y-tunnus haetaan PRH:n avoimesta yritysrekisteristä ja julkaistaan tarkistuksen jälkeen.",
      "Linkkitarkistus ja muut lähdeajot käynnistyvät ajastetusti.",
    ],
  },
  {
    pvm: "2026-08-22",
    otsikko: "Julkinen rekisteri",
    kohdat: [
      "Hankelistaus, hankesivu lähteineen, kartta ja tulevat määräajat.",
      "Ilmoitus uudesta hankkeesta tai täydennyksestä menee jonoon. Ylläpitäjä julkaisee lähteen tarkistettuaan.",
      "YVA-mielipideopas.",
      "Hankealue ja sähkönsiirtoreitti näkyvät kartalla, kun ne on merkitty lähteineen.",
    ],
  },
];
