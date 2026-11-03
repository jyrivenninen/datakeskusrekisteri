# §5 HTML-välimuisti — suunnitelma (ei toteutusta tässä kierroksessa)

Tila 2026-10-13: dokumenttien HTML/PDF noudetaan ajossa (`agents/tarkistukset/dokumentit.ts`),
talletetaan vain SHA-256 (`dokumentit.sisalto_tiiviste`) + tekstikatkelma
(`dokumentti_tiivisteet.teksti_katkelma`). Raaka HTML ei ole tallessa; agentti
noutaa uudelleen jokaisessa lukukierroksessa.

## Tavoite

Säilyttää julkisten lähde-HTML-sivujen raaka sisältö uudelleenkäyttöön
(lähteenvahvistaja, tiivistäjä, lainausvertailu) ilman toistuvaa HTTP-noutoa
ja ilman että sisältö vuotaa `anon`/`authenticated`-rooleille.

## Vaihtoehdot

### A — Supabase Storage -bucket `dokumentti-html` (suositus)

- Polku: `{dokumentti_id}/{sisalto_tiiviste}.html` (tai `.bin` PDF:lle).
- Kirjoitus: vain `service_role` (agenttiajo).
- Luku: vain `service_role`; ei public URL -listaa.
- Metatiedot `dokumentit`-tauluun: `sisalto_bucket_polku text`, `sisalto_tavut int`,
  `sisalto_noudettu_pvm timestamptz` (jo osin olemassa nouto-syy-kentissä).
- Hyödyt: suuret tiedostot pois Postgresista; tiiviste jo olemassa.
- Haitat: uusi riippuvuus (Storage); migraatio + agenttimuutos.

### B — Postgres `bytea` / `text` -sarake

- `dokumentti_sisalto (dokumentti_id, tiiviste, muoto, tavut bytea, noudettu_pvm)`.
- RLS + REVOKE ALL FROM anon/authenticated; GRANT vain service_role.
- Hyödyt: yksi tietokanta, backup mukana.
- Haitat: taulun koko; 25 Mt -katto per dokumentti jo nyt agentissa.

### C — Vain tekstikatkelman pidennys

- Nostetaan `teksti_katkelma`-rajaa; ei raakaa HTML:ää.
- Hyödyt: pieni muutos.
- Haitat: ei riitä uudelleenparsintaan / lainauksen tarkkaan kohtaan.

## Suositeltu järjestys (kun hyväksytään)

1. Bucket + RPC `tallenna_dokumentti_sisalto` / `lue_dokumentti_sisalto` (service_role).
2. `dokumentit.ts`: onnistuneen noudon jälkeen kirjoita Storage, jos tiiviste uusi.
3. Lukijat (`lahteenvahvistaja`, `tiivistaja`): lue Storage ennen HTTP:tä, jos polku + tiiviste täsmää.
4. Retention: poista objektit, joiden tiiviste ≠ nykyinen `sisalto_tiiviste` (tai > N kk).
5. Ei julkista HTTP-endpointtia HTML:lle.

## Ei tässä kierroksessa

- Ei migraatiota, ei bucketia, ei pushia (§5b ODOTTAA).
- HTML pysyy yksityisenä (ei `anon`-luku).
