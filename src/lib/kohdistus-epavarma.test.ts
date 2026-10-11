import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KOHDISTUS_EPAVARMA_HUOMAUTUS,
  onKohdistusEpavarma,
  tulkitseKohdistusIlmenee,
} from "./kohdistus-epavarma";

describe("kohdistus_epavarma", () => {
  it("tunnistaa Huittinen-tyyppisen huomautuksen", () => {
    assert.equal(
      onKohdistusEpavarma({
        huomautus: "Erä 1 puuttuva asiakirja (paatos). eri hanke (FCDC), ei tämän hankkeen",
      }),
      true,
    );
  });

  it("tunnistaa Parkano-tyyppisen «ei tämä»", () => {
    assert.equal(
      KOHDISTUS_EPAVARMA_HUOMAUTUS.test(
        "avattu; eri hanke (Helios, Vakerinmäki) – ei tämä",
      ),
      true,
    );
  });

  it("ei osu «eri hanke kuin X» -selvennykseen", () => {
    assert.equal(
      onKohdistusEpavarma({
        huomautus: "Eri hanke kuin Herva (Valoa Networks). Automaattijulkaistu.",
      }),
      false,
    );
  });

  it("kunniaa strukturoitua lippua", () => {
    assert.equal(
      onKohdistusEpavarma({
        huomautus: "neutraali teksti",
        sisalto: { kentat: {}, kohdistus_epavarma: true, kohdistus_huomio: "FCDC" },
      }),
      true,
    );
  });

  it("tulkitsee mita_ilmenee", () => {
    const t = tulkitseKohdistusIlmenee("eri hanke (FCDC), ei tämän hankkeen");
    assert.equal(t.kohdistus_epavarma, true);
    assert.ok(t.kohdistus_huomio?.includes("FCDC"));
  });
});
