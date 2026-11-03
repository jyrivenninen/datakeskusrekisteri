# Luonnokset

Tämän kansion tiedostoja ei ajeta ilman erillistä päätöstä.

Ne eivät kuulu `supabase/migrations/`-kansioon. `supabase db push` ei näe niitä,
eikä niitä saa siirtää sinne tai ajaa tuotantoon (`apply_migration`, `db push`,
`psql`) ennen kuin ajo on erikseen hyväksytty.

Esimerkki, jota ei ole hyväksytty ajettavaksi:
`20261103190000_kirista_funktion_suoritusoikeudet_luonnos.sql`.
