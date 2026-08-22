# Datakeskushankkeiden kansallinen rekisteri

Avoin hanketietokanta ja prosessiopas. Toimeksianto on tiedostossa
[`PROJEKTI.md`](./PROJEKTI.md). Sitovat säännöt ovat kansiossa
[`.cursor/rules/`](./.cursor/rules/).

## Paikallinen kehitys

1. Kopioi `.env.example` tiedostoksi `.env.local` (jos sitä ei vielä ole).
2. Täytä Supabase-arvot `.env.local`-tiedostoon. Älä liitä avaimia chattiin.
3. Käynnistä kehityspalvelin:

```bash
npm install
npm run dev
```

Avaa [http://localhost:3000](http://localhost:3000).

## Julkaisu

Julkaisu tapahtuu `git push` → Vercel. Ympäristömuuttujat lisätään Vercelin
projektin asetuksiin, ei repositorioon.
