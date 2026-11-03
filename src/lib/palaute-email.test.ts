import assert from "node:assert/strict";
import test from "node:test";
import { normalisoiVastausEmail } from "./palaute-email";

test("ilman valintaa osoitetta ei tallenneta", () => {
  assert.deepEqual(normalisoiVastausEmail(false, ""), { email: null, virhe: null });
  assert.equal(
    normalisoiVastausEmail(false, "a@b.fi").virhe,
    "Sähköpostiosoite voidaan antaa vain, jos haluat vastauksen.",
  );
});

test("valinta vaatii kelvollisen osoitteen", () => {
  assert.equal(normalisoiVastausEmail(true, "  ").virhe, "Anna sähköpostiosoite, jos haluat vastauksen.");
  assert.equal(normalisoiVastausEmail(true, "ei-osoite").virhe, "Sähköpostiosoite ei ole kelvollinen.");
  assert.equal(normalisoiVastausEmail(true, "a@b.fi").email, "a@b.fi");
});
