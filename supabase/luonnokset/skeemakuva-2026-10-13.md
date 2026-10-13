# Skeemakuva (tuotanto) — 2026-10-13

Projekti: `wtjcmdutledvsdmrotnu` (eu-west-1). Vain luku.

## Migraatiohistoria (huippu)

| version | name |
|---------|------|
| 20261014110000 | sivukatselut_paiva |
| 20261014100000 | kaava_ala_ha |
| 20261013093015 | muutosehdotukset_agentti_luku_omat |
| 20261013083125 | default_priv_tables_revoke_anon_auth |
| 20261013083123 | sulje_julkaise_agentti_ehdotus_agentilta |
| 20261013070631 | hanke_teho_julkinen |
| 20261013000423 | tehohavainnot_b2 |

Drift: ks. `tuotanto-ajetut/README.md` (26 vain-remote, 28 vain-local, 111 molemmissa).

## Public-taulut ja näkymät

Taulut (r): dokumentit, dokumentti_tiivisteet, faktakentta_sitovuus, fingrid_liityntapisteet, fingrid_tuotanto, hanke_ei_sama, hanke_johdot, hanke_kunnat, hanke_kuvat, hanke_lahdehaut, hanke_menettelyt, hanke_ohjaukset, hanke_organisaatio_roolit, hanke_organisaatiot, hanke_rakentamisvaiheet, hanke_vaihtoehdot, hankevinkit, hankkeet, julkaistut_muutokset, kentta_lahteet, kentta_tarkistukset, kunnat, kunta_esityslista_lahteet, lahdeajot, luvun_lapikaynti, maaraajat, mallikutsut, muutosehdotukset, organisaatio_suhde_tyypit, organisaatio_suhteet, organisaatiot, paatokset, palautteet, rajapinta_tiivisteet, sivukatselut, sivukatselut_paiva, tehohavainnot, yhteyshenkilot, yllapitajat, yllapito_luonnokset.

Näkymä (v): `hanke_teho_julkinen` — julkinen teho min–max per hanke.

## julkaise_* -oikeudet (otanta)

Kaikki tarkistetut `julkaise_*` + `kirjaa_julkaistu_muutos`: `anon` EXECUTE=false, `authenticated` EXECUTE=false, `service_role` EXECUTE=true.

`julkaise_ehdotetut_tiedot` live-allekirjoitus **ei** sisällä `p_tehohavainnot` (vielä). Merkitty-default logiikka: tyhjä → `koneen_ehdottama`.

## muutosehdotukset RLS

| policy | qual |
|--------|------|
| muutosehdotukset_agentti_luku | `ehdottaja_tyyppi = 'agentti'` |
| muutosehdotukset_yllapito_luku | `onko_yllapitaja()` |
| muutosehdotukset_yllapito_paivitys | `onko_yllapitaja()` |

Rivimäärät: 3676 yhteensä, 3385 `ehdottaja_tyyppi=agentti`. Table SELECT: authenticated=true, anon=false.

## tehohavainnot

Taulu tuotannossa (`tehohavainnot_b2`). Julkinen aggregaatti: `hanke_teho_julkinen`.
