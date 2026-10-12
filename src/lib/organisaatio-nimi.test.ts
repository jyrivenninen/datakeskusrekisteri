import assert from "node:assert/strict";
import test from "node:test";
import { onOrganisaatioNimi } from "./organisaatio-nimi";

test("organisaationimet hyväksytään", () => {
  assert.equal(onOrganisaatioNimi("Sweco Finland Oy"), true);
  assert.equal(onOrganisaatioNimi("FCG Finnish Consulting Group Oy"), true);
  assert.equal(onOrganisaatioNimi("Arkkitehtitoimisto Jarmo Lokio Oy"), true);
  assert.equal(onOrganisaatioNimi("Rauman kaupunki tekninen toimiala / kaavoitus"), true);
  assert.equal(onOrganisaatioNimi("Ramboll"), true);
  assert.equal(onOrganisaatioNimi("Projoplan Oy"), true);
});

test("henkilönimet hylätään", () => {
  assert.equal(onOrganisaatioNimi("Emma Kaitaa"), false);
  assert.equal(onOrganisaatioNimi("Juha Pasma"), false);
  assert.equal(onOrganisaatioNimi("Ilkka Tarkkanen"), false);
  assert.equal(onOrganisaatioNimi("ei ilmene"), false);
  assert.equal(onOrganisaatioNimi(""), false);
});
