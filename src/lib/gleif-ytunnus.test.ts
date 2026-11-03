import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gleifSuomalainenYtunnus,
  normalisoiGleifYtunnus,
} from "./gleif-ytunnus";

test("normalisoiGleifYtunnus: kelvollinen", () => {
  assert.equal(normalisoiGleifYtunnus("0112038-9"), "0112038-9");
});

test("normalisoiGleifYtunnus: 8 numeroa", () => {
  assert.equal(normalisoiGleifYtunnus("01120389"), "0112038-9");
});

test("normalisoiGleifYtunnus: väärä tarkistusmerkki", () => {
  assert.equal(normalisoiGleifYtunnus("0112038-0"), null);
});

test("gleifSuomalainenYtunnus: RA000188", () => {
  assert.equal(
    gleifSuomalainenYtunnus({
      rekisterinumero: "0112038-9",
      rekisteriviranomainen: "RA000188",
      maa: null,
    }),
    "0112038-9",
  );
});

test("gleifSuomalainenYtunnus: FI", () => {
  assert.equal(
    gleifSuomalainenYtunnus({
      rekisterinumero: "0112038-9",
      rekisteriviranomainen: null,
      maa: "FI",
    }),
    "0112038-9",
  );
});

test("gleifSuomalainenYtunnus: ei Suomi", () => {
  assert.equal(
    gleifSuomalainenYtunnus({
      rekisterinumero: "0112038-9",
      rekisteriviranomainen: "RA000001",
      maa: "SE",
    }),
    null,
  );
});
