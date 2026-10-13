import assert from "node:assert/strict";
import test from "node:test";
import {
  KENTAN_TILA_NIMET,
  MERKINTA_NIMET,
  merkintaNayttoteksti,
  merkintaVihje,
} from "./naytto";

test("koneen_ehdottama ennallaan", () => {
  assert.equal(merkintaNayttoteksti("koneen_ehdottama", null), "Koneen ehdottama");
  assert.equal(merkintaNayttoteksti("koneen_ehdottama", "yksittain"), "Koneen ehdottama");
  assert.equal(MERKINTA_NIMET.koneen_ehdottama, "Koneen ehdottama");
  assert.equal(merkintaVihje("koneen_ehdottama", null), null);
});

test("ihmisen_vahvistama ilman kuittaustapaa → Ylläpitäjän hyväksymä", () => {
  assert.equal(merkintaNayttoteksti("ihmisen_vahvistama", null), "Ylläpitäjän hyväksymä");
  assert.equal(merkintaNayttoteksti("ihmisen_vahvistama", undefined), "Ylläpitäjän hyväksymä");
  assert.equal(merkintaNayttoteksti("ihmisen_vahvistama", ""), "Ylläpitäjän hyväksymä");
  assert.equal(MERKINTA_NIMET.ihmisen_vahvistama, "Ylläpitäjän hyväksymä");
  assert.match(merkintaVihje("ihmisen_vahvistama", null) ?? "", /erinä/);
});

test("kuittaustapa yksittain → Lähde tarkistettu", () => {
  assert.equal(
    merkintaNayttoteksti("ihmisen_vahvistama", "yksittain"),
    "Lähde tarkistettu",
  );
  assert.match(merkintaVihje("ihmisen_vahvistama", "yksittain") ?? "", /avannut lähteen/);
});

test("kuittaustapa era → Lähde tarkistettu (erä)", () => {
  assert.equal(
    merkintaNayttoteksti("ihmisen_vahvistama", "era"),
    "Lähde tarkistettu (erä)",
  );
  assert.match(merkintaVihje("ihmisen_vahvistama", "era") ?? "", /erä/);
});

test("ei vanhaa Ihmisen vahvistama -tekstiä", () => {
  assert.doesNotMatch(merkintaNayttoteksti("ihmisen_vahvistama", null), /Ihmisen vahvistama/);
  assert.doesNotMatch(MERKINTA_NIMET.ihmisen_vahvistama, /Ihmisen vahvistama/);
});

test("vihreän valon selite", () => {
  assert.equal(
    KENTAN_TILA_NIMET.vahvistettu,
    "Vihreä: viranomaislähde, jonka ylläpitäjä on hyväksynyt.",
  );
});
