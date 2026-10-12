/**
 * Kertaluonteinen jonon siivous 2026-09-08.
 * Poistettu käytöstä: geokoodaaOsoite vaatii nyt pakollisen odotetun kunnan,
 * eikä skriptiä saa ajaa ilman kuntavarmennettua polkua.
 */
console.error(
  "scripts/hyvaksy-jono-loppu-2026-09-08.ts on poistettu käytöstä. " +
    "Geokoodaus vaatii odotetun kunnan (kunnat-taulu); älä aja tätä skriptiä.",
);
process.exit(1);
