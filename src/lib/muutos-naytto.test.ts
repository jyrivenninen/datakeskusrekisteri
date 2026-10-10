import assert from "node:assert/strict";
import test from "node:test";
import {
  lahdeLinkinNimi,
  muotoilePvmLyhyt,
  muutoksetPolku,
  muutosYlarivi,
  parsiSivu,
  rakennaMuutoksetRss,
  sivujaYhteensa,
  yhteensaLause,
  type JulkaistuMuutosNakyma,
} from "./muutos-naytto";

test("lyhyt päivä on ilman vuotta", () => {
  assert.equal(muotoilePvmLyhyt("2026-10-05T12:00:00Z"), "5.10.");
  assert.equal(muotoilePvmLyhyt("2026-10-10"), "10.10.");
});

test("muutosrivi käyttää suomenkielistä kenttää ja vaihetta", () => {
  assert.equal(muutosYlarivi("uusi_hanke", "Helios"), "Uusi hanke");
  assert.equal(muutosYlarivi("vaihe", "kaavoitus"), "Vaihe: Kaavoitus");
  assert.equal(muutosYlarivi("sahkonkaytto_twh_a", null), "Sähkönkäyttö (TWh/a): tyhjennetty");
  assert.equal(muutosYlarivi("it_teho_mw", "500"), "IT-teho (MW): 500");
});

test("lähdelinkin nimi on otsikko tai verkkonimi", () => {
  assert.equal(lahdeLinkinNimi("  YVA-selostus  ", "https://example.fi/a"), "YVA-selostus");
  assert.equal(lahdeLinkinNimi(null, "https://www.ymparisto.fi/sites/a.pdf"), "ymparisto.fi");
});

test("sivutus ja polku", () => {
  assert.equal(parsiSivu(undefined), 1);
  assert.equal(parsiSivu("0"), 1);
  assert.equal(parsiSivu("3"), 3);
  assert.equal(sivujaYhteensa(0, 40), 1);
  assert.equal(sivujaYhteensa(41, 40), 2);
  assert.equal(muutoksetPolku({}), "/muutokset");
  assert.equal(
    muutoksetPolku({ kunta: "Veteli", vaihe: "kaavoitus", sivu: 2 }),
    "/muutokset?kunta=Veteli&vaihe=kaavoitus&sivu=2",
  );
  assert.equal(yhteensaLause(1, "muutos", "muutosta"), "Yhteensä 1 muutos.");
  assert.equal(yhteensaLause(148, "muutos", "muutosta"), "Yhteensä 148 muutosta.");
});

test("rss pakenee merkinnät", () => {
  const rivi: JulkaistuMuutosNakyma = {
    id: "abc",
    kentta: "nimi",
    uusi_arvo: "A & B <hanke>",
    hyvaksytty_pvm: "2026-10-05T09:00:00.000Z",
    lahde_url: "https://example.fi/a?x=1",
    lahde_otsikko: 'Otsikko "1"',
    hanke: {
      id: "h1",
      nimi: "Helios",
      kunta: "Veteli",
      vaihe: "kaavoitus",
    },
  };
  const xml = rakennaMuutoksetRss([rivi], "https://example.fi");
  assert.match(xml, /A &amp; B &lt;hanke&gt;/);
  assert.match(xml, /Otsikko &quot;1&quot;/);
  assert.doesNotMatch(xml, /A & B/);
});
