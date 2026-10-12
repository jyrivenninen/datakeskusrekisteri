import assert from "node:assert/strict";
import { test } from "node:test";
import {
  geokoodausVastaaKuntaa,
  muotoileKoordinaatit,
  normalisoiKuntaKoodi,
} from "./geokoodaus";

test("kuntakoodin nollat jätetään pois vertailussa", () => {
  assert.equal(normalisoiKuntaKoodi("256"), normalisoiKuntaKoodi("0256"));
});

test("geokoodausVastaaKuntaa hyväksyy koodin tai nimen", () => {
  assert.equal(
    geokoodausVastaaKuntaa(
      { kunta_koodi: "256", kunta_nimi: "Kinnula" },
      { nimi: "Kinnula", koodi: "256" },
    ),
    true,
  );
  assert.equal(
    geokoodausVastaaKuntaa(
      { kunta_koodi: "858", kunta_nimi: "Tuusula" },
      { nimi: "Kinnula", koodi: "256" },
    ),
    false,
  );
});

test("muotoileKoordinaatit", () => {
  assert.equal(muotoileKoordinaatit(63.3673, 24.97), "63.3673 N, 24.9700 E");
});
