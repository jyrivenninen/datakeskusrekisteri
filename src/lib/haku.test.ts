import assert from "node:assert/strict";
import test from "node:test";
import {
  aktiivisetEhdot,
  hankkeSopiiHakuun,
  hankkeetSuodatusPolku,
  normalisoiHakusana,
  onAktiivinenSuodatus,
  parsiHakusana,
} from "./haku";

test("parsiHakusana trimmaa ja rajaa pituuden", () => {
  assert.equal(parsiHakusana("  helsinki  "), "helsinki");
  assert.equal(parsiHakusana(""), undefined);
  assert.equal(parsiHakusana("   "), undefined);
  assert.equal(parsiHakusana("a".repeat(250))?.length, 200);
});

test("haku on kirjainkoosta riippumaton ja tukee ääkkösiä", () => {
  assert.equal(
    hankkeSopiiHakuun({ nimi: "Järvenpään datakeskus", kunta: "Järvenpää" }, "järvenpää"),
    true,
  );
  assert.equal(
    hankkeSopiiHakuun({ nimi: "Järvenpään datakeskus", kunta: "Järvenpää" }, "JÄRVENPÄÄ"),
    true,
  );
  assert.equal(
    hankkeSopiiHakuun({ nimi: "Testi", kunta: "Helsinki" }, "HELSINK"),
    true,
  );
  assert.equal(hankkeSopiiHakuun({ nimi: "Muu", kunta: "Turku" }, "helsinki"), false);
});

test("osittainen sana tuottaa osuman", () => {
  assert.equal(
    hankkeSopiiHakuun({ nimi: "Espoon datakeskusalue", kunta: "Espoo" }, "data"),
    true,
  );
});

test("hankkeetSuodatusPolku ja tyhjennys", () => {
  const taydellinen = {
    q: "helsinki",
    kunta: "Helsinki",
    vaihe: "toiminnassa" as const,
    koko: "suuri" as const,
    kuvalliset: true,
  };
  assert.equal(
    hankkeetSuodatusPolku(taydellinen),
    "/?q=helsinki&kunta=Helsinki&vaihe=toiminnassa&koko=suuri&kuvalliset=1",
  );
  assert.equal(hankkeetSuodatusPolku({}), "/");
});

test("aktiivisetEhdot ja onAktiivinenSuodatus", () => {
  const suodatus = { q: "test" };
  assert.equal(onAktiivinenSuodatus(suodatus), true);
  assert.equal(onAktiivinenSuodatus({}), false);
  const ehdot = aktiivisetEhdot({ q: "abc", kunta: "Espoo" });
  assert.equal(ehdot.length, 2);
  assert.equal(hankkeetSuodatusPolku(ehdot[0]!.poista), "/?kunta=Espoo");
});

test("normalisoiHakusana käsittelee erikoismerkit literaalina", () => {
  assert.equal(normalisoiHakusana("100%"), "100%");
  assert.equal(normalisoiHakusana("O'Brien"), "o'brien");
});
