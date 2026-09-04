# Lisäys PROJEKTI.md:hen — Agentin automaattijulkaisu

> **Cursor: tämä täydentää PROJEKTI.md:n luvut 3 ja 4.**
> Korvaa aiemman periaatteen «agentti ei koskaan julkaise» osittain.
> Cursor-säännöt viittaavat tähän tiedostoon.

---

## Periaate

Rekisteri erottaa **julkaistun** ja **varmennetun** tiedon.

| Käsite | Tietokanta | Julkinen merkitys |
|--------|------------|-------------------|
| Julkaistu | arvo `hankkeet`-taulussa + `kentta_lahteet` | näkyy sivustolla |
| Varmennettu | `kentta_lahteet.merkitty = ihmisen_vahvistama` | ylläpitäjä on kuittannut |
| Luottamus | `kentta_lahteet.luottamus` | lähteen vahvuus (epävarma / vahvistettu / ristiriitainen) |

**Agentti saa julkaista** uutta tietoa ja nostaa luottamusta automaattisesti tietyin ehdoin.
**Varmennettu** tieto (ihmisen kuittaus) ja **`luottamus = vahvistettu`** ovat aina ihmisen
kädessä. Ihmisen hyväksyntä/julkaisu ylläpidosta menee aina läpi (kuten ennen).

---

## Luottamusasteet (numeerinen vertailu)

Automaattijulkaisussa vertaillaan kentän **parasta nykyistä** luottamusta uuteen:

| Luottamus | Taso | Agentti saa asettaa? |
|-----------|------|----------------------|
| (ei arvoa / ei lähdettä) | 0 | — |
| `ristiriitainen` | — | ei koskaan automaattisesti |
| `epavarma` | 1 | kyllä |
| `vahvistettu` | 2 | ei — vain ihminen |

Agentin ehdotuksessa `luottamus = vahvistettu` **alennetaan** automaattijulkaisussa
`epavarma`-tasolle. Lähde tallennetaan aina `merkitty = koneen_ehdottama`.

---

## Milloin agentti julkaisee automaattisesti

Koskee tyyppejä `uusi_hanke`, `taydennys`, `korjaus`. Ei koske `paatos`, havaintoja
(`linkki_rikki`, `ristiriita_havainto`, …) eikä valokuvia.

Kenttä julkaistaan automaattisesti, jos **kaikki** pätee:

1. Ehdotuksessa on kelvollinen lähde (`lahde_url`, `vahvistettu_pvm`, …).
2. Ehdotettu luottamus ei ole `ristiriitainen`.
3. Kenttää **ei ole** merkitty `ihmisen_vahvistama` (varmennettu tieto on suojattu).
4. Jokin seuraavista:
   - **Uusi arvo**: hankekenttä on tyhjä (mukaan lukien uuden hankesivun kentät).
   - **Korkeampi luottamus**: uusi luottamustaso > nykyinen paras taso **ja** arvo
     pysyy samana tai muuttuu vain korkeamman luottamuksen myötä.

Kenttä **jää jonoon** (ihmisen hyväksyntä), jos:

- arvo muuttuu **samalla** luottamustasolla;
- kenttä on jo **varmennettu** (`ihmisen_vahvistama`);
- ehdotus on `paatos` tai havainto;
- kenttä on `ristiriitainen`.

### Uusi hankesivu

Sama sääntö: agentti voi luoda `uusi_hanke`-julkaisun, jos vähintään pakolliset kentät
(`nimi`, `kunta`, `vaihe`) ja muut automaattijulkaisuun kelpaavat kentät täyttyvät.

Osittainen julkaisu:

- kelpaavat kentät julkaistaan heti;
- loput jäävät `muutosehdotukset`-jonoon (`tyyppi` → `taydennys`, `hanke_id` täyttyy);
- ehdotus pysyy `tila = odottaa`, kunnes ihminen käsittelee loput.

Agentin työnkulku: `INSERT muutosehdotukset` → `RPC julkaise_agentti_ehdotus(ehdotus_id)`.

---

## Ihmisen rooli

### Hyväksyntä (jonossa oleva ehdotus)

Ylläpitäjä hyväksyy muutokset kuten ennen. Julkaisu merkitään
`merkitty = ihmisen_vahvistama` ja `luottamus` tulee hyväksynnästä (voi olla
`vahvistettu`).

### Kuittaus (kevyt)

Automaattijulkaistu tieto (`koneen_ehdottama`) odottaa **kuittausta**:
ylläpitäjä merkitsee «nähdyksi» ilman arvon uudelleentarkistusta.
Kuittaus asettaa `merkitty = ihmisen_vahvistama` ja oletuksena `luottamus = vahvistettu`.

### Varmennettu tieto

- Vain ihminen voi antaa varmennetun merkinnän.
- Botin automaattijulkaisu **ei koskaan** ylikirjoita varmennettua kenttää.
- Ihmisen tekemä päivitys (ylläpito / ilmoituslomake kirjautuneena) hyväksytään
  aina julkaisuun.

---

## Julkinen näyttö

Liikennevalo / kentän tila:

- **Varmennettu** — vähintään yksi lähde `ihmisen_vahvistama`, ei ristiriitaa.
- **Julkaistu, ei varmennettu** — arvo näkyy, kaikki lähteet `koneen_ehdottama`
  tai epävarma ilman kuittausta.
- **Puuttuu** — ei arvoa.

---

## Turva

- Agentti kutsuu vain `julkaise_agentti_ehdotus`-funktiota; ei suoraa kirjoitusta
  julkaistuihin tauluihin.
- `julkaise_ehdotetut_tiedot` (ihmisen täysi hyväksyntä) on edelleen vain
  `service_role`-oikeudella.
- Säännöt pakotetaan SQL-funktiossa, ei agentin ohjeissa.
