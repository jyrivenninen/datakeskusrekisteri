import assert from "node:assert/strict";
import test from "node:test";
import {
  onOpenStreetMapMenetelmaUrl,
  piilotaJulkinenAsiakirjaUrl,
} from "./lahde-geokoodaus-url";

test("piilottaa MML-geokoodaus-URL:n", () => {
  assert.equal(
    piilotaJulkinenAsiakirjaUrl(
      "https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v2/pelias/search?text=Myk%C3%A4nmaa",
    ),
    true,
  );
});

test("piilottaa Nominatim-URL:t", () => {
  assert.equal(
    onOpenStreetMapMenetelmaUrl(
      "https://nominatim.openstreetmap.org/search?q=Myk%C3%A4n%2C+Keminmaa",
    ),
    true,
  );
  assert.equal(
    piilotaJulkinenAsiakirjaUrl(
      "https://nominatim.openstreetmap.org/ui/search.html?q=Myk%C3%A4ntie",
    ),
    true,
  );
});

test("piilottaa Helsingin WFS-rajapinnan", () => {
  assert.equal(
    piilotaJulkinenAsiakirjaUrl(
      "https://kartta.hel.fi/ws/geoserver/avoindata/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=avoindata:Kaavayksikot",
    ),
    true,
  );
});

test("ei piilota tavallista YVA-sivua", () => {
  assert.equal(
    piilotaJulkinenAsiakirjaUrl(
      "https://www.ymparisto.fi/fi/osallistu-ja-vaikuta/ymparistovaikutusten-arviointi/mykanmaan-datakeskus-keminmaa-tornio",
    ),
    false,
  );
});
