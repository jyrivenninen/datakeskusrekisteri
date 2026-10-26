#!/usr/bin/env python3
"""Tarkistaa GeoPackagen GDAL:n (osgeo.ogr) palauttamista geometrioista.

Ei laske pelkkiä rivimääriä. Jokainen kohde luetaan GDAL:n geometriana:
None ja tyhjä geometria hylätään, ja kehys pidetään Suomen laatikossa.
Kohdemääriä ei ole kovakoodattu.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from osgeo import gdal, ogr, osr
except ImportError:
    print("::error::Python-moduuli osgeo puuttuu. Asenna paketti python3-gdal.", flush=True)
    sys.exit(1)

# Viennin geometriatasot. Määrät tulevat tiedostosta.
ODOTETUT_TASOT = ("hankkeet_pisteet", "hankkeet_alueet", "johtoreitit")

LON_MIN = 19.0
LON_MAX = 32.0
LAT_MIN = 59.0
LAT_MAX = 71.0


def virhe(viesti: str) -> None:
    print(f"::error::{viesti}", flush=True)


def on_sqlite(polku: Path) -> bool:
    alku = polku.read_bytes()[:16]
    return alku.startswith(b"SQLite format 3")


def nayta_vaara_sisalto(polku: Path) -> int:
    alku = polku.read_bytes()[:500]
    teksti = alku.decode("utf-8", errors="replace").lower()
    if "vercel.com/login" in teksti or teksti.lstrip().startswith("<!doctype html") or teksti.lstrip().startswith("<html"):
        virhe(
            "Vastaus on Vercelin kirjautumissivu tai HTML-sivu, ei rekisterin GeoPackage-tiedostoa."
        )
        return 1
    virhe("Tiedosto ei ala SQLite-tunnisteella. Odotettu rekisterin GeoPackage.")
    return 1


def crs_on_epsg_4326(srs: osr.SpatialReference | None) -> bool:
    if srs is None:
        return False
    kopio = srs.Clone()
    kopio.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    if kopio.GetAuthorityName(None) == "EPSG" and kopio.GetAuthorityCode(None) == "4326":
        return True
    viite = osr.SpatialReference()
    viite.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    viite.ImportFromEPSG(4326)
    return bool(kopio.IsSame(viite))


def on_geometriataso(taso: ogr.Layer) -> bool:
    if taso.GetGeomType() != ogr.wkbNone:
        return True
    return bool(taso.GetGeometryColumn())


def kehys_suomessa(min_x: float, max_x: float, min_y: float, max_y: float) -> bool:
    return (
        LON_MIN <= min_x <= LON_MAX
        and LON_MIN <= max_x <= LON_MAX
        and LAT_MIN <= min_y <= LAT_MAX
        and LAT_MIN <= max_y <= LAT_MAX
    )


def tarkista_taso(taso: ogr.Layer) -> tuple[int, tuple[float, float, float, float]]:
    nimi = taso.GetName()
    if not crs_on_epsg_4326(taso.GetSpatialRef()):
        wkt = ""
        srs = taso.GetSpatialRef()
        if srs is not None:
            wkt = srs.ExportToWkt()[:240]
        virhe(f"{nimi}: koordinaatisto ei ole EPSG:4326. {wkt}")
        raise SystemExit(1)

    taso.ResetReading()
    lkm = 0
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    kohde = taso.GetNextFeature()
    while kohde is not None:
        lkm += 1
        geom = kohde.GetGeometryRef()
        fid = kohde.GetFID()
        if geom is None:
            virhe(f"{nimi} fid {fid}: GDAL palautti geometriaksi None")
            raise SystemExit(1)
        if geom.IsEmpty():
            virhe(f"{nimi} fid {fid}: GDAL palautti tyhjän geometrian")
            raise SystemExit(1)
        xmin, xmax, ymin, ymax = geom.GetEnvelope()
        if not kehys_suomessa(xmin, xmax, ymin, ymax):
            virhe(
                f"{nimi} fid {fid}: kehys lon {xmin}–{xmax}, lat {ymin}–{ymax} "
                f"on laatikon lon {LON_MIN:g}–{LON_MAX:g}, lat {LAT_MIN:g}–{LAT_MAX:g} ulkopuolella"
            )
            raise SystemExit(1)
        min_x = min(min_x, xmin)
        max_x = max(max_x, xmax)
        min_y = min(min_y, ymin)
        max_y = max(max_y, ymax)
        kohde = taso.GetNextFeature()

    if lkm < 1:
        virhe(f"{nimi}: geometriatasolla ei ole yhtään kohdetta")
        raise SystemExit(1)
    return lkm, (min_x, max_x, min_y, max_y)


def main() -> int:
    if len(sys.argv) != 2:
        virhe("Käyttö: tarkista_gpkg.py <tiedosto.gpkg>")
        return 2

    polku = Path(sys.argv[1])
    if not polku.is_file():
        virhe(f"Tiedostoa ei löydy: {polku}")
        return 1
    if not on_sqlite(polku):
        return nayta_vaara_sisalto(polku)

    print(f"GDAL {gdal.VersionInfo('RELEASE_NAME')}", flush=True)
    print("Tiedosto on rekisterin GeoPackage (SQLite), ei Vercelin kirjautumissivu.", flush=True)

    gdal.UseExceptions()
    try:
        aineisto = ogr.Open(str(polku), 0)
    except RuntimeError as exc:
        virhe(f"GDAL ei saanut GeoPackagea auki: {exc}")
        return 1
    if aineisto is None:
        virhe("GDAL ei saanut GeoPackagea auki.")
        return 1

    nimet = {aineisto.GetLayerByIndex(i).GetName() for i in range(aineisto.GetLayerCount())}
    for odotettu in ODOTETUT_TASOT:
        if odotettu not in nimet:
            virhe(f"Geometriataso puuttuu: {odotettu}")
            return 1

    geometriatasot = []
    for i in range(aineisto.GetLayerCount()):
        taso = aineisto.GetLayerByIndex(i)
        if on_geometriataso(taso):
            geometriatasot.append(taso)
    if not geometriatasot:
        virhe("GDAL ei palauttanut yhtään geometriatasoa.")
        return 1

    for taso in geometriatasot:
        lkm, (min_x, max_x, min_y, max_y) = tarkista_taso(taso)
        print(
            f"{taso.GetName()}: {lkm} kohdetta, "
            f"kehys lon {min_x:.5f}–{max_x:.5f}, lat {min_y:.5f}–{max_y:.5f}, "
            "koordinaatisto EPSG:4326",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
