# Datakeskushankkeiden kansallinen rekisteri

> **Cursor: lue tämä tiedosto kokonaan ennen ensimmäistä tehtävää.**
> Tämä on projektin toimeksianto. `.cursor/rules/` sisältää sitovat säännöt.

---

## 1. Mitä rakennetaan

Julkinen, kansallinen verkkosivusto, jonne kootaan Suomessa vireillä olevat
datakeskushankkeet, niiden eteneminen, määräajat ja niihin liittyvä tietotaito.

Tavoitteena on, että hankealueiden asukkaat ympäri Suomen voivat
- nähdä mitä missäkin on vireillä ja missä vaiheessa,
- saada ajoissa tiedon vaikuttamisen määräajoista (YVA-mielipiteet,
  kaavamuistutukset, valitusajat),
- löytää yhteyshenkilöitä, järjestöjä ja viranomaistahoja,
- hyödyntää muiden jo tekemää selvitystyötä.

### Positiointi — tämä ohjaa kaikkia ratkaisuja

Sivusto on **avoin hanketietokanta ja prosessiopas**, ei kampanjasivu.
Sävy on neutraali, havaintopohjainen ja lähteistetty. Sivuston pitää olla
sellainen, että toimittaja, tutkija, virkamies ja hankkeen edustaja voivat
kaikki käyttää sitä pitämättä sitä propagandana. Neutraalius on tässä
strateginen valinta, ei kompromissi.

### Ei-tavoitteet

- Ei mielipidekirjoituksia, ei kannanottoja, ei "vastustajien foorumi"
- Ei väitteitä yksittäisten virkamiesten tai luottamushenkilöiden aikeista
- Ei keskustelupalstaa (moderointitaakka tappaisi projektin)

---

## 2. Tekninen pino

| Osa | Valinta |
|---|---|
| Sovellus | Next.js (App Router, TypeScript) |
| Tietokanta | Supabase (Postgres) |
| Hosting | Vercel, kytkettynä GitHub-repoon |
| Kartta | MapLibre GL + Maanmittauslaitoksen avoin taustakartta |
| Agenttiajot | TypeScript-skriptit `/agents`, ajossa GitHub Actions (cron) |
| Malli agenteille | Anthropic API (Claude) + web search -työkalu |

Julkaisu tapahtuu automaattisesti `git push` → Vercel. Ei erillistä
julkaisuvaihetta.

### Koodi vs. sisältö — pidä raja ehdottomana

- **Koodi** (rakenne, ulkoasu, agenttiskriptit, skeemamigraatiot) → git-repo
- **Sisältö** (hanketiedot, määräajat, yhteyshenkilöt) → Postgres

Hanketietoja **ei** koskaan tallenneta markdown-tiedostoiksi repoon, vaikka se
olisi Cursorin kannalta kätevää. Muut ylläpitäjät eivät käytä gitiä,
ilmoituslomake ei voi kirjoittaa repoon, ja agenttien muutosehdotukset
tarvitsevat tietokantatason lukituksen.

---

## 3. Tietomallin periaatteet

Nämä ovat projektin tärkein osa. Jälkikäteen korjaaminen on kallista.

1. **Kentät ovat atomisia ja koneluettavia.** Ei vapaata tekstiä muotoa
   "noin 40 generaattoria, teho epäselvä". Luku omaan kenttäänsä,
   epävarmuus omaan kenttäänsä.

2. **Jokainen faktaväite kantaa lähteensä.** URL, sivunumero jos
   dokumentti, vahvistuspäivämäärä ja luottamustaso. Väite ilman lähdettä
   ei mene tietokantaan — tämä pakotetaan tietokantatasolla, ei
   käyttöliittymässä.

3. **Julkaistu tieto ja ehdotettu tieto ovat eri tauluissa.**
   `hankkeet` = julkaistu tieto (näkyy sivustolla).
   `muutosehdotukset` = sisääntuleva (lomake, agentti, ylläpitäjä).
   **Varmennettu** tieto (`kentta_lahteet.merkitty = ihmisen_vahvistama`) on erillinen
   käsite julkaistusta. Agentti saa julkaista uutta tietoa automaattisesti tietyin
   ehdoin; varmennettu merkintä ja `luottamus = vahvistettu` ovat aina ihmisen
   kädessä. Tarkat säännöt: `PROJEKTI-lisays-agentti-julkaisu.md`.

4. **Kaikki muutokset ovat jäljitettäviä.** Kuka/mikä ehdotti, milloin,
   millä lähteellä, kuka hyväksyi.

---

## 4. Agenttiperiaate

Tarkennettu: `PROJEKTI-lisays-vaihe7.md` ja `PROJEKTI-lisays-agentti-julkaisu.md`.

**Agentti julkaisee uutta tietoa automaattisesti vain sääntöjen mukaan. Muutokset
samalla luottamustasolla ja varmennetun tiedon ylikirjoitus vaativat ihmisen.**

Agentti kirjoittaa `muutosehdotukset`-tauluun ja kutsuu `julkaise_agentti_ehdotus`.
Automaattijulkaisu merkitsee aina `koneen_ehdottama`; varmennettu tieto on vain
ihmiseltä. Ei suoraa kirjoitusta julkaistuihin tauluihin, ei poistoa, ei sähköpostia
eikä ulkoisia kutsuja sivuvaikutuksilla.

**Älä käytä mallia siihen mikä hoituu koodilla.** Jos tarkistuksen voi
ilmaista SQL:llä, HTTP-pyyntönä tai merkkijonovertailuna, se ei saa
kutsua kielimallia.

Mallia vaativille agenteille kysytään todennettavaa: lähdekohta tai
`ei_loydy`. Tyhjä kenttä on parempi kuin arvattu.

---

## 5. Avoin data

Kaikki julkaistu tieto on saatavilla koneluettavasti alusta asti:
- JSON-endpoint hankekohtaisesti
- Koko rekisterin lataus CSV- ja JSON-muodossa

Tämä palvelee kolmea asiaa yhtä aikaa: omia agentteja, toimittajia ja
tutkijoita, sekä sitä että sivusto on aidosti avointa dataa eikä vain
väitä olevansa.

---

## 6. Toteutusjärjestys

Tee tässä järjestyksessä. Älä hyppää agentteihin ennen kuin vaiheet 1–5
ovat valmiit — ne ovat helppo osa, kun tietomalli on kunnossa.

### Vaihe 1 — Pohja
- [x] Next.js + TypeScript + Tailwind, Supabase-kytkentä, Vercel-deploy
- [x] Ympäristömuuttujat `.env.local` (ei koskaan gitiin)

### Vaihe 2 — Skeema
- [x] Migraatio `supabase/migrations/`: `hankkeet`, `kentta_lahteet`,
      `muutosehdotukset`, `maaraajat`, `yhteyshenkilot`, `organisaatiot`
- [x] Tietokantatason pakotteet: `NOT NULL`, `CHECK`-ehdot, ei lähteetöntä
      faktakenttää
- [x] Row Level Security: julkinen luku vain julkaistuun tietoon

### Vaihe 3 — Ensimmäinen hanke käsin
- [x] Jokelan (Tuusula) hanke syötettynä loppuun asti
- [x] Tämä paljastaa skeeman puutteet ennen kuin mitään on rakennettu päälle

### Vaihe 4 — Julkinen näkymä
- [x] Hankelistaus: suodatus kunnan, vaiheen ja koon mukaan
- [x] Yksittäisen hankkeen sivu: kaikki kentät lähdeviitteineen näkyvissä
- [x] Kartta
- [x] Tulevat määräajat etusivulla
- [x] Etusivun suodatin, laskurit (lukumäärä, sähkönkäyttö vs. Suomen
      sähköntuotanto, verkkosähkön CO₂-arvio, teho, pinta-ala, generaattorit)
      ja kartta ennen hankeluetteloa

### Vaihe 5 — Ylläpito ja ilmoitus
- [x] Ilmoituslomake (uusi hanke / täydennys) → `muutosehdotukset`
- [x] Hankesivun kentästä «Päivitä»: ylläpitäjä julkaisee lähteineen,
      muu käyttäjä lähettää tarkistusjonoon
- [x] Hankesivun valokuvagalleria (URL, kuvateksti, kuvaaja); muut kuin
      ylläpitäjä hyväksynnän kautta
- [x] Ylläpitonäkymä: ehdotusten tarkistus ja hyväksyntä (myös
      `hanke_vaihtoehdot`)
- [x] Kirjautuminen ylläpitäjille (Supabase Auth)

### Vaihe 6 — Sisältö
- [x] "Näin teet YVA-mielipiteen" -opas: aikajana, mitä missäkin vaiheessa
      voi vielä vaikuttaa, mallipohja
- [x] Yhteyshenkilö- ja organisaatiohakemisto

### Vaihe 7 — Tarkistukset ja agentit
Tarkennettu: `PROJEKTI-lisays-vaihe7.md`. Luku 7A.5 ja uusi 7A.6:
`PROJEKTI-lisays-7A5-rajapinnat.md`.
- [x] 7A.1 Linkkitarkistus (`agents/tarkistukset/linkit.ts`)
- [x] 7A.2 Dokumenttien muutosvahti (`agents/tarkistukset/dokumentit.ts`)
- [x] 7A.3 Ristiriidat SQL:llä (`agents/tarkistukset/ristiriidat.ts`)
- [ ] 7A.4 Vanhentumisvahti (`agents/tarkistukset/vanhentuneet.ts`)
- [ ] 7A.5 Rakenteiset rajapinnat (`agents/lahteet/`)
- [x] 7A.5.1 Ryhti, avoin kaava-aineisto (`agents/lahteet/ryhti.ts`)
- [x] 7A.5.2 YTJ/PRH (`agents/lahteet/ytj.ts`)
- [x] 7A.5.3 MML geokoodaus (`agents/lahteet/mml.ts`)
- [x] 7A.5.5 Syken hakemisto, kuntakoodisto (`agents/lahteet/hakemisto.ts`)
- [ ] 7A.6 Kuntien esityslistat (`agents/lahteet/kunnat/`)
- [ ] Mallirajapinta (`agents/malli.ts`) ennen 7B:tä
- [ ] 7B.1 Lähteenvahvistaja (`agents/lahteenvahvistaja.ts`)
- [ ] 7B.2 Esikäsittelijä (`agents/esikasittelija.ts`)
- [ ] 7B.3 Muutosten tiivistäjä (`agents/tiivistaja.ts`)

### Vaihe 8 — Avoin data
- [ ] JSON-endpointit, CSV-lataus, lisenssitieto (suositus: CC BY 4.0)

---

## 7. Mitä Cursor tekee itse, mitä kysyy, mitä pyytää käyttäjältä

**Cursor tekee itse ilman kysymistä:**
koodin, migraatiot, komponentit, testit, tyylit, agenttiskriptit,
GitHub Actions -konfiguraatiot, dokumentaation.

**Cursor kysyy ennen etenemistä:**
- tietomallin muutokset, jotka poistavat tai uudelleennimeävät kenttiä
- uudet ulkoiset riippuvuudet, jotka maksavat rahaa
- mikä tahansa ratkaisu, joka poikkeaa `.cursor/rules/`-säännöistä
- sisällölliset sanamuodot, jotka koskevat hankkeita tai toimijoita

**Cursor pyytää käyttäjää tekemään (ei yritä itse):**
Nämä vaativat tilin, maksun tai selaimen. Cursor kirjoittaa
selkeän, numeroidun ohjeen ja odottaa vahvistusta:
- tilien luonti (GitHub, Supabase, Vercel, Anthropic Console)
- API-avainten haku ja liittäminen `.env.local`-tiedostoon
- domainin rekisteröinti ja DNS-asetukset
- salasanat ja maksutiedot

Cursor ei koskaan pyydä käyttäjää liittämään API-avainta chattiin — avaimet
menevät suoraan `.env.local`-tiedostoon tai Vercelin asetuksiin.

---

## 8. Projektin ihmisorganisaatio (taustaksi)

- Projektilla tulee olla 2–3 ylläpitäjää ennen julkistusta. Yhden ihmisen
  projekti kuolee kuudessa kuukaudessa.
- Harkitaan yhdistysmuotoa tai olemassa olevan yhdistyksen alle menemistä
  ennen kasvua: rekisterinpitäjän vastuu, domainin omistus ja mahdolliset
  oikeudelliset yhteydenotot ovat helpompia yhdistyksenä kuin
  yksityishenkilönä.
