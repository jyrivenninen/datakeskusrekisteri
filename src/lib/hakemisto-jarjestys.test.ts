import assert from "node:assert/strict";
import { test } from "node:test";
import {
  jarjestaHakemistoRivit,
  parsiHakemistoJarjestys,
} from "./hakemisto-jarjestys";

test("parsiHakemistoJarjestys: oletus nimi", () => {
  assert.equal(parsiHakemistoJarjestys(undefined), "nimi");
  assert.equal(parsiHakemistoJarjestys("muu"), "nimi");
  assert.equal(parsiHakemistoJarjestys("hankkeita"), "hankkeita");
});

test("jarjestaHakemistoRivit: aakkoset ja hankemäärä", () => {
  const rivit = [
    { nimi: "Öljy Oy", hankkeita: 1 },
    { nimi: "Aalto Oy", hankkeita: 3 },
    { nimi: "Beta Oy", hankkeita: 3 },
  ];
  assert.deepEqual(
    jarjestaHakemistoRivit(rivit, "nimi").map((r) => r.nimi),
    ["Aalto Oy", "Beta Oy", "Öljy Oy"],
  );
  assert.deepEqual(
    jarjestaHakemistoRivit(rivit, "hankkeita").map((r) => r.nimi),
    ["Aalto Oy", "Beta Oy", "Öljy Oy"],
  );
});
