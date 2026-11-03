/** Palautelomakkeen vapaaehtoinen vastausosoite. Osoitetta ei kirjoiteta lokeihin. */

const SAHKOPOSTI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PITUUS_KATTO = 320;

export function normalisoiVastausEmail(
  haluaaVastauksen: boolean,
  raaka: string,
): { email: string | null; virhe: string | null } {
  if (!haluaaVastauksen) {
    if (raaka.trim()) {
      return {
        email: null,
        virhe: "Sähköpostiosoite voidaan antaa vain, jos haluat vastauksen.",
      };
    }
    return { email: null, virhe: null };
  }
  const email = raaka.trim();
  if (!email) {
    return { email: null, virhe: "Anna sähköpostiosoite, jos haluat vastauksen." };
  }
  if (email.length > PITUUS_KATTO || !SAHKOPOSTI.test(email)) {
    return { email: null, virhe: "Sähköpostiosoite ei ole kelvollinen." };
  }
  return { email, virhe: null };
}
