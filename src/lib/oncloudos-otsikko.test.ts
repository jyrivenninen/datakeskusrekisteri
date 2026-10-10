import assert from "node:assert/strict";
import test from "node:test";
import {
  ehdotaOncloudosLiiteOtsikko,
  oncloudosEmoKokousUrl,
  pdfOtsikkoEhdokasTekstista,
} from "./oncloudos-otsikko";

test("oncloudosEmoKokousUrl liitteestä emoon", () => {
  const url = "https://raahe10.oncloudos.com/kokous/2026800-12-60434.PDF";
  assert.equal(
    oncloudosEmoKokousUrl(url),
    "https://raahe10.oncloudos.com/kokous/2026800-12.PDF",
  );
});

test("ehdotaOncloudosLiiteOtsikko tyhjä PDF + geneerinen otsikko", () => {
  const e = ehdotaOncloudosLiiteOtsikko(
    "Suunnittelualueen rajaus",
    "Kaavoitusaloite: Datakeskus Hummastinvaaran alue, § 112",
    "",
  );
  assert.match(e!, /Liite: Suunnittelualueen rajaus \(§ 112\)/);
});

test("pdfOtsikkoEhdokasTekstista ohittaa geneerisen liitteen", () => {
  const e = pdfOtsikkoEhdokasTekstista("Suunnittelualueen rajaus\nKaavoitusaloite testi");
  assert.match(e!, /Kaavoitusaloite testi/);
});
