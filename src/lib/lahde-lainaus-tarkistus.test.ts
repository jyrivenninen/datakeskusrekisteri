import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  kaavatunnusEsiintyyLainauksessa,
  kortteliEsiintyyLainauksessa,
  lukuEsiintyyLainauksessa,
  tarkistaArvoLainauksessa,
} from "./lahde-lainaus-tarkistus";

describe("kortteliEsiintyyLainauksessa", () => {
  it("normalisoi kortteli X tontti Y → X-Y", () => {
    assert.equal(
      kortteliEsiintyyLainauksessa(
        "2319-1",
        "Kapulin yritysalueen korttelin 2319 tontin 1 osaa vastaavan",
      ),
      true,
    );
    assert.equal(
      kortteliEsiintyyLainauksessa("2319-1", "Tilan nimi K2319T1"),
      true,
    );
    assert.equal(
      kortteliEsiintyyLainauksessa(
        "2319-1",
        "korttelin 2316 tontin 2 ja tontin 1 osan",
      ),
      false,
    );
  });

  it("pilkkoo korttelilistat", () => {
    assert.equal(
      kortteliEsiintyyLainauksessa(
        "2516, 2517, 2518",
        "asemakaavan mukaiseen kortteliin 2517",
      ),
      false,
    );
    assert.equal(
      kortteliEsiintyyLainauksessa(
        "2516, 2517",
        "kortteleihin 2516 ja 2517",
      ),
      true,
    );
  });
});

describe("kaavatunnusEsiintyyLainauksessa", () => {
  it("poistaa etuliitteet", () => {
    assert.equal(
      kaavatunnusEsiintyyLainauksessa("553", "kaavanro 553: hyväksyminen"),
      true,
    );
    assert.equal(
      kaavatunnusEsiintyyLainauksessa(
        "A217",
        "asemakaavan (kaavatunnus A217) mukaisesta",
      ),
      true,
    );
  });
});

describe("lukuEsiintyyLainauksessa", () => {
  it("normalisoi pilkun, pisteen ja välilyönnin", () => {
    assert.equal(lukuEsiintyyLainauksessa("18.71", "n. 18,71 ha"), true);
    assert.equal(lukuEsiintyyLainauksessa("500.000", "noin 500 MW"), true);
    assert.equal(
      lukuEsiintyyLainauksessa("7.38", "noin 58 800 m2:n"),
      false,
    );
  });
});

describe("tarkistaArvoLainauksessa", () => {
  it("ohittaa vaiheen", () => {
    assert.equal(
      tarkistaArvoLainauksessa("vaihe", "kaavoitus", "x").tulos,
      "ohita",
    );
  });
});
