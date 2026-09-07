import assert from "node:assert/strict";
import test from "node:test";
import { csvSolu, csvRivi, hankkeetCsv, AVOIN_DATA_LISENSSI } from "./avoin-data";

test("csvSolu lainaa lainausmerkit ja pilkut", () => {
  assert.equal(csvSolu("Helsinki"), "Helsinki");
  assert.equal(csvSolu(null), "");
  assert.equal(csvSolu('Sana " lainaus'), '"Sana "" lainaus"');
  assert.equal(csvSolu("a,b"), '"a,b"');
});

test("csvRivi yhdistää solut pilkuilla", () => {
  assert.equal(csvRivi(["id", "nimi", null]), "id,nimi,");
});

test("hankkeetCsv sisältää otsikkorivin", () => {
  const csv = hankkeetCsv([]);
  assert.match(csv, /^id,nimi,/);
  assert.equal(AVOIN_DATA_LISENSSI.lyhenne, "CC BY 4.0");
});
