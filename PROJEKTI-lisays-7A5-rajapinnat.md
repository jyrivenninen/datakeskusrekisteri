# Korvaava luku 7A.5 — Rakenteiset viranomaisrajapinnat

> **Cursor: tämä korvaa PROJEKTI-lisays-vaihe7.md:n luvun 7A.5
> kokonaisuudessaan. Muut luvut pysyvät ennallaan.**

Sijainti: `/agents/lahteet/`

Periaate ennallaan: jos tieto on saatavilla rakenteisesta rajapinnasta, se
haetaan sieltä. Kielimallia ei käytetä arvaamaan tietoa, joka on
saatavilla koneluettavana.

**Ennen jokaisen sovittimen toteutusta:** hae rajapinnan ajantasainen
osoite, versio, käyttöehdot ja mahdollinen API-avainvaatimus. Alla olevat
osoitteet ovat lähtökohtia, eivät todennettuja vakioita. Rajapinnat
versioituvat ja siirtyvät. Jos osoite ei vastaa, älä arvaa uutta — kysy
käyttäjältä.

---

## 7A.5.1 Ryhti — rakennetun ympäristön tietojärjestelmä (tärkein)

Ylläpitäjä: Suomen ympäristökeskus. Kokoaa alueidenkäytön ja rakentamisen
tiedot valtakunnallisesti.

**Miksi tämä on rekisterin kannalta keskeisin rajapinta:** laki velvoittaa
kunnat ja maakuntien liitot toimittamaan kaavatiedot **kaavan tullessa
vireille**, ehdotusvaiheessa sekä hyväksytystä, lainvoimaisesta ja
kumoutuneesta kaavasta. Vireilletulo on juuri se hetki, jolloin hanke
pitää saada rekisteriin — nykyisin sen huomaa vain se, joka lukee oikean
kunnan kuulutuksia oikeaan aikaan.

Saatavuus: avoin OGC API Features -rajapinta kaavatiedoista sekä
rakennuksista, hankerakennuksista ja osoitteista. Lisäksi WMS ja avoin
karttapalvelu. Tarkempi rakennus- ja lupatieto vaatii tietoluvan ja on
maksullinen — **sitä ei käytetä**.

Lähtökohtia:
- `https://ryhti.syke.fi/`
- Kaavatietojen metatiedot:
  `https://ckan.ymparisto.fi/dataset/rakennetun-ympariston-tietojarjestelman-kaavatiedot`
- Rakennustietojen metatiedot:
  `https://ckan.ymparisto.fi/dataset/rakennetun-ympariston-tietojarjestelman-rakennustiedot`

**Kattavuusvaraus, joka on näytettävä käyttöliittymässä:**
velvoite koskee 1.1.2024 jälkeen hyväksyttyjä kaavoja ja sillä on viiden
vuoden siirtymäaika. Aineisto on valtakunnallisesti kattava vasta
1.1.2029 alkaen. Siihen asti se sisältää kaavoja vain niiltä alueilta,
jotka ovat toimittaneet tietoja.

Ryhti siis **täydentää** manuaalista seurantaa, ei korvaa sitä. Ryhdistä
puuttuva hanke ei ole todiste siitä, ettei hanketta ole. Tämä on
kirjattava sekä koodin kommentteihin että käyttöliittymän
kattavuushuomautukseen.

Toteutus:
- ajastettu haku, joka etsii uusia ja muuttuneita kaavakohteita
  hankekuntien alueelta (valmisteilla olevat kaavat) ja kansallisesti
  hakusanoilla sekä tunnetuilla kaavatunnuksilla
- osuma → ehdotus `muutosehdotukset`-tauluun tyypillä `ryhti_havainto`
- ei koskaan suoraa julkaisua

Todettu 24.8.2026:
- avoin OGC API Features, ei API-avainta, CC BY 4.0
- juuri: `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`
- kokoelmat: `pub_prep_ld_plan_ix_gs`, `pub_prep_lm_plan_ix_gs`,
  `pub_valid_ld_plan_ix_gs`, `pub_valid_lm_plan_ix_gs`
- sivutus: `limit` (enintään 3000) ja `links.rel=next`; `startIndex`
- kuntatunnus kentässä `administrative_area_identifiers` merkkijonona
  `["749"]`; suodatin `like '%"749"%'`
- `odata`-tyylinen ILIKE ei toimi; käytä `strToLowerCase(...) like`
- valmisteilla olevat kokoelmat olivat tyhjiä; hakemistoissa tuhansia
  kohteita. Maksullista lupatietoa (`ryhti_permit` tietoluvalla) ei käytetä.
- pitkäkestoiseen käyttöön Syke edellyttää sovelluskohtaista tunnistetta:
  pyyntö osoitteeseen gistuki (at) syke.fi. Agentti ei lähetä sähköpostia.

Sovitin: `agents/lahteet/ryhti.ts` (`npm run agentti:ryhti`).
Kuiva-ajo: `RYHTI_KUIVA=1`. Valinnainen `SYKE_RAJAPINTA_TUNNISTE` User-Agentiin.

## 7A.5.2 YTJ / PRH

Toimijan nimi, Y-tunnus, rekisteröintipäivä, toimiala, kotipaikka.
Käytetään toimijatietojen vahvistamiseen ja ristiriitatarkistuksiin
(7A.3): sama Y-tunnus eri nimillä, hankkeen päivämäärä ennen toimijan
rekisteröintiä.

Todettu 24.8.2026:
- `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId={y-tunnus}`
- `https://avoindata.prh.fi/opendata-ytj-api/v3/companies?name={toiminimi}`
  (`page`, 100 osumaa per sivu)
- ei API-avainta, lisenssi CC BY 4.0, päivitys kerran vuorokaudessa
- yksittäistä `/companies/{id}`-polkua ei ole (400); tietueosoite on
  businessId-kysely
- ei kata toiminimiä, kuntia eikä hyvinvointialueita; ei sähköposteja
  eikä puhelinnumeroita
- mainitse lähde; älä käytä PRH:n tai YTJ:n logoa

Sovitin: `agents/lahteet/ytj.ts` (`npm run agentti:ytj`).
Kirjoittaa `ytj_havainto`-ehdotuksia, `rajapinta_tiivisteet` ja `lahdeajot`.
Nimihaku julkaistuille organisaatioille ilman Y-tunnusta (ei kunta/ELY/AVI/LVV/
ministeriö): tasan yksi osuma, jonka nykyinen toiminimi täsmää → ehdotus
`ehdota_tunnus`. Hyväksyntä kutsuu `julkaise_organisaation_y_tunnus`
(kenttä + `kentta_lahteet`, `lahde_laji` `rajapinta`). Agentti ei kirjoita
`organisaatiot`-tauluun. Tyhjä on parempi kuin arvaus.
Kuiva-ajo: `YTJ_KUIVA=1`.
Migraatio: `20260824230000_julkaise_organisaation_y_tunnus.sql`.

## 7A.5.3 Maanmittauslaitos

Kiinteistötiedot, geokoodaus, maastotietokanta, taustakartat.
OGC API Features. Avoimet rajapinnat ovat maksuttomia, mutta
**vaativat API-avaimen**, joka luodaan MML:n omassa palvelussa.

Sama OmaTili-avain kuin taustakartassa (`NEXT_PUBLIC_MML_API_AVAIN`).
Sopimuspalvelua ei käytetä.

Todettu 24.8.2026:
- geokoodaus v2: `https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/reverse`
- avoin kiinteistö-OGC: `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/`
- tunnistus: HTTP Basic, avain käyttäjänä, salasana tyhjä (avain ei lahde_url:ään)
- CC BY 4.0; ei massa-ajoa

Sovitin: `agents/lahteet/mml.ts` (`npm run agentti:mml`).
Käänteinen geokoodaus julkaistuille sijainneille → `mml_havainto` jos kunta eroaa.
Kuiva-ajo: `MML_KUIVA=1`. Migraatio: `20260824220000_mml_havainto.sql`.

## 7A.5.4 Fingrid avoin data

Kantaverkon liityntäpisteet, siirtokapasiteetti, kulutus- ja
tuotantotiedot. Datakeskushankkeen kannalta olennaista: hankkeet
sijoittuvat sinne, missä on liityntämahdollisuus.

Käyttö toistaiseksi taustatietona, ei automaattisena kenttätäyttönä.

## 7A.5.5 Syken hakemistorajapinta

Yhteiset koodistot: Suomen kunnat, maakunnat, ELY-keskukset, vesistöt,
vesienhoitoalueet.

**Käytä tätä kuntien ja ELY-keskusten koodistojen lähteenä. Älä koodaa
kuntalistaa käsin tiedostoon.**

Dokumentaatio (ei GET-osoite):
`https://api-developer.ymparisto.fi/api-details#api=hakemisto`

Todettu 24.8.2026 (GET, ei tilausavainta, `api-version=1`):
- kokoelma: `https://api.ymparisto.fi/hakemisto/odata/Kunta?api-version=1`
- tietue: `https://api.ymparisto.fi/hakemisto/odata/Kunta({kuntaId})?api-version=1`
- `$top` enintään 200; täydellä sivulla `@odata.nextLink` puuttuu, joten
  sivutus `$skip`-parametrilla (0, 200, …) kunnes sivu on vajaatäysi
- `$expand=ely,maakunta` (ei `yke`)
- `odata/Alusta` on näytealusta, ei kuntaluettelo
- lisenssi CC BY 4.0, palaute `herttapaivystajat@syke.fi`

Sovitin: `agents/lahteet/hakemisto.ts` (`npm run agentti:hakemisto`).
Kirjoittaa `kunnat`-tauluun (`koodi` ← `nro`) ja `lahdeajot`-lokiin.
Kuiva-ajo: `HAKEMISTO_KUIVA=1`.

## 7A.5.6 Syken kuulutukset

Ympäristölupa- ja YVA-kuulutukset. Selvitä onko saatavilla rakenteisena
vai vain HTML-sivuna. Jos vain HTML, se menee kohtaan 7A.6.

Lähtökohta: `https://www.syke.fi/fi/palvelut/viranomaispalvelut/kuulutukset`

## 7A.5.7 Tilastokeskus PxWeb

Kuntien perustiedot: väkiluku, pinta-ala, talousluvut. JSON-muotoinen
PxWeb-rajapinta. Käytetään hankkeen suhteuttamiseen kunnan kokoon.

## 7A.5.8 avoindata.fi / opendata.fi

Kansallinen avoimen datan hakemisto.

**Toimintaohje:** ennen kuin oletat, ettei jostain tiedosta ole
rajapintaa, hae avoindata.fi:stä. Osa kunnista julkaisee päätösdataa
siellä mainostamatta sitä omilla sivuillaan.

---

## 7A.6 Kuntien esityslistat ja pöytäkirjat

**Yhtenäistä kansallista rajapintaa ei ole.** Kunnat käyttävät eri
asianhallintajärjestelmiä (mm. CaseM, Dynasty, Tweb, Kuntatoimisto),
eikä useimmista saa rakenteista dataa ulos. Helsingin OpenAhjo-rajapinta
on suljettu, eikä korvaavan aikataulusta ollut arviota vuoden 2024
lopussa.

Toteuta järjestyksessä, älä hyppää suoraan viimeiseen:

**1. RSS ja iCal.** Osa kunnista tarjoaa kokous- tai kuulutussyötteen.
Halvin ja luotettavin reitti. Kartoita hankekunnista ensin.

**2. avoindata.fi-haku hankekunnittain.** Ks. 7A.5.8.

**3. Järjestelmäkohtaiset sovittimet.** Yksi moduuli per
asianhallintajärjestelmä, **ei per kunta** — muutamalla sovittimella
katetaan kymmeniä kuntia. Rakenne:

```
/agents/lahteet/kunnat/
  sovittimet/casem.ts
  sovittimet/dynasty.ts
  sovittimet/tweb.ts
  sovittimet/rss.ts
  kuntakartoitus.ts   // kunta → järjestelmä → perus-URL
```

Yhteinen rajapinta kaikille sovittimille:

```ts
interface KuntaSovitin {
  tunnus: string;
  haeKokoukset(kuntaUrl: string, alkaen: Date): Promise<Kokous[]>;
  haeAsiat(kokousUrl: string): Promise<Asia[]>;
}
```

Ehdot:
- kunnioita robots.txt:ää, käytä tunnistautuvaa User-Agentia ja
  kohtuullista viivettä pyyntöjen välillä
- yhden kunnan tai sovittimen hajoaminen ei saa kaataa koko ajoa —
  virhe kirjataan ja ajo jatkuu
- osuma hakusanoihin (`datakeskus`, `konesali`, `hyperscale`,
  toimijan nimi, kaavatunnus) → ehdotus `muutosehdotukset`-tauluun
- ei kielimallia tässä vaiheessa; malli tulee mukaan vasta 7B.3
  tiivistämään mitä löytyi

**4. Ihmisilmoitus.** Osa kunnista jää katveeseen aina. Sen paikkaa
ilmoituslomake ja paikalliset yhteyshenkilöt — se on ominaisuus, ei
puute.

---

## Rajapintojen terveysvalvonta

Lisää tauluun `lahdeajot`: sovitin, ajankohta, statuskoodi, osumien
määrä, virheviesti. Ylläpitonäkymässä näkyy, mikä sovitin on hajonnut.

Rajapinnat muuttuvat ja versioituvat. Lisää seurantaan Syken
rajapintamuutosten RSS-syöte
(`https://rajapinnat.ymparisto.fi/api/rss/feed.xml`), jotta
rikkoutuvat rajapinnat huomataan ennen kuin ne kaatavat ajon.

---

## Lähdemerkintä

Jokainen rajapinnasta haettu arvo saa `lahde_url`-kenttään pysyvän
viittauksen alkuperäiseen tietueeseen, ei rajapinnan juuriosoitetta.
Rajapintahaku on lähde siinä missä PDF-dokumenttikin, ja sen
`luottamus` on `vahvistettu` vain, jos rajapinta on viranomaisen oma.
