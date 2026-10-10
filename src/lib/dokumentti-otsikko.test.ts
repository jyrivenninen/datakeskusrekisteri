import assert from "node:assert/strict";
import test from "node:test";
import { onYhteystietoOtsikko, turvallinenDokumenttiOtsikko } from "./dokumentti-otsikko";

test("tunnistaa puhelinnumeron otsikosta", () => {
  assert.equal(onYhteystietoOtsikko("040 505 6342 Email."), true);
});

test("korvaa yhteystiedon URL-tiedostonimellä", () => {
  const url =
    "https://www.ymparisto.fi/sites/default/files/documents/26_08_07_Keminmaa_DataCenter_YVA-ohjelma_0.pdf";
  assert.equal(
    turvallinenDokumenttiOtsikko({
      url,
      otsikko: "040 505 6342 Email.",
      otsikko_automaattinen: false,
    }),
    "26 08 07 Keminmaa DataCenter YVA ohjelma 0",
  );
});

test("säilyttää kelvollisen otsikon", () => {
  assert.equal(
    turvallinenDokumenttiOtsikko({
      url: "https://example.fi/a.pdf",
      otsikko: "Mykänmaan datakeskus, YVA-ohjelma",
      otsikko_automaattinen: false,
    }),
    "Mykänmaan datakeskus, YVA-ohjelma",
  );
});
