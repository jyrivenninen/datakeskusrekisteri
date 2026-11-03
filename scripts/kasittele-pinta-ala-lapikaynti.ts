/**
 * Ajettu SQL-tiedostolla (service_role ei saa UPDATE hankkeet-tauluun).
 *
 *   npx supabase db query --linked -f scripts/kasittele-pinta-ala-lapikaynti.sql
 */
console.error(
  "Käytä: npx supabase db query --linked -f scripts/kasittele-pinta-ala-lapikaynti.sql",
);
process.exit(1);
