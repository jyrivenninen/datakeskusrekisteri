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

## Tietokanta

Skeema on kansiossa `supabase/migrations/`. Aja migraatiot Supabase-projektiin:

```bash
npx supabase login
npx supabase link
npx supabase db push
```

Project ref löytyy Supabase-hallintapaneelista (Settings → General).
Älä liitä avaimia chattiin. Hanketietoja ei tallenneta gittiin.

## Julkaisu

Julkaisu tapahtuu `git push` → Vercel. Ympäristömuuttujat lisätään Vercelin
projektin asetuksiin, ei repositorioon.
