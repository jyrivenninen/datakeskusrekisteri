/**
 * GeoPackage (SQLite) julkaistusta rekisteristä.
 * Koordinaatit ovat pituus, leveys (EPSG:4326), sama järjestys kuin GeoJSON.
 * Kirjoitus käyttää sql.js:ää, jotta reitti toimii ilman natiivia SQLite-kirjastoa.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import initSqlJs from "sql.js";
import type { AvoinDataHanke } from "@/lib/avoin-data";
import type { SijaintiViiva } from "@/lib/supabase/tietokanta";

const SRS_ID = 4326;

type SqlJs = Awaited<ReturnType<typeof initSqlJs>>;
type Tietokanta = InstanceType<SqlJs["Database"]>;

let sqlJsLupaus: Promise<SqlJs> | null = null;

export function lataaSqlJs(): Promise<SqlJs> {
  sqlJsLupaus ??= (async () => {
    const wasm = readFileSync(
      join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    );
    const binaari = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
    return initSqlJs({ wasmBinary: binaari });
  })();
  return sqlJsLupaus;
}

function wkbPiste(lon: number, lat: number): Uint8Array {
  const buf = new Uint8Array(21);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, 1, true);
  view.setFloat64(5, lon, true);
  view.setFloat64(13, lat, true);
  return buf;
}

function wkbViiva(pisteet: number[][]): Uint8Array {
  const buf = new Uint8Array(9 + pisteet.length * 16);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, 2, true);
  view.setUint32(5, pisteet.length, true);
  let kohta = 9;
  for (const piste of pisteet) {
    view.setFloat64(kohta, piste[0] ?? 0, true);
    view.setFloat64(kohta + 8, piste[1] ?? 0, true);
    kohta += 16;
  }
  return buf;
}

function wkbMoniviiva(osat: number[][][]): Uint8Array {
  const viivat = osat.map(wkbViiva);
  const koko = 9 + viivat.reduce((summa, viiva) => summa + viiva.length, 0);
  const buf = new Uint8Array(koko);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, 5, true);
  view.setUint32(5, viivat.length, true);
  let kohta = 9;
  for (const viiva of viivat) {
    buf.set(viiva, kohta);
    kohta += viiva.length;
  }
  return buf;
}

function wkbPolygoni(renkaat: number[][][]): Uint8Array {
  let pisteita = 0;
  for (const rengas of renkaat) pisteita += rengas.length;
  const buf = new Uint8Array(9 + renkaat.length * 4 + pisteita * 16);
  const view = new DataView(buf.buffer);
  buf[0] = 1;
  view.setUint32(1, 3, true);
  view.setUint32(5, renkaat.length, true);
  let kohta = 9;
  for (const rengas of renkaat) {
    view.setUint32(kohta, rengas.length, true);
    kohta += 4;
    for (const piste of rengas) {
      view.setFloat64(kohta, piste[0] ?? 0, true);
      view.setFloat64(kohta + 8, piste[1] ?? 0, true);
      kohta += 16;
    }
  }
  return buf;
}

function kuori(wkb: Uint8Array, laajuus: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(40 + wkb.length);
  const view = new DataView(out.buffer);
  out[0] = 0x47;
  out[1] = 0x50;
  out[2] = 0;
  out[3] = 0x11;
  view.setInt32(4, SRS_ID, true);
  view.setFloat64(8, laajuus[0], true);
  view.setFloat64(16, laajuus[1], true);
  view.setFloat64(24, laajuus[2], true);
  view.setFloat64(32, laajuus[3], true);
  out.set(wkb, 40);
  return out;
}

function laajuusPisteista(pisteet: number[][]): [number, number, number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const piste of pisteet) {
    const x = piste[0] ?? 0;
    const y = piste[1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, maxX, minY, maxY];
}

function viivanPisteet(reitti: SijaintiViiva): { wkb: Uint8Array; laajuus: [number, number, number, number] } | null {
  if (reitti.type === "LineString") {
    const pisteet = reitti.coordinates as number[][];
    if (pisteet.length < 2) return null;
    return { wkb: wkbViiva(pisteet), laajuus: laajuusPisteista(pisteet) };
  }
  const osat = reitti.coordinates as number[][][];
  const kelvolliset = osat.filter((osa) => osa.length >= 2);
  if (kelvolliset.length === 0) return null;
  return {
    wkb: kelvolliset.length === 1 ? wkbViiva(kelvolliset[0]!) : wkbMoniviiva(kelvolliset),
    laajuus: laajuusPisteista(kelvolliset.flat()),
  };
}

type Laatikko = { minX: number; maxX: number; minY: number; maxY: number };

function laajenna(laatikko: Laatikko | null, laajuus: [number, number, number, number]): Laatikko {
  if (!laatikko) {
    return { minX: laajuus[0], maxX: laajuus[1], minY: laajuus[2], maxY: laajuus[3] };
  }
  return {
    minX: Math.min(laatikko.minX, laajuus[0]),
    maxX: Math.max(laatikko.maxX, laajuus[1]),
    minY: Math.min(laatikko.minY, laajuus[2]),
    maxY: Math.max(laatikko.maxY, laajuus[3]),
  };
}

function luoPerustaulu(db: Tietokanta) {
  db.run("PRAGMA application_id = 1196444487");
  db.run("PRAGMA user_version = 10200");
  db.run(`CREATE TABLE gpkg_spatial_ref_sys (
    srs_name TEXT NOT NULL,
    srs_id INTEGER NOT NULL PRIMARY KEY,
    organization TEXT NOT NULL,
    organization_coordsys_id INTEGER NOT NULL,
    definition TEXT NOT NULL,
    description TEXT
  )`);
  db.run(
    `INSERT INTO gpkg_spatial_ref_sys VALUES
      ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian'),
      ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic'),
      ('WGS 84', 4326, 'EPSG', 4326,
        'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
        'longitude/latitude')`,
  );
  db.run(`CREATE TABLE gpkg_contents (
    table_name TEXT NOT NULL PRIMARY KEY,
    data_type TEXT NOT NULL,
    identifier TEXT UNIQUE,
    description TEXT DEFAULT '',
    last_change TEXT NOT NULL,
    min_x DOUBLE,
    min_y DOUBLE,
    max_x DOUBLE,
    max_y DOUBLE,
    srs_id INTEGER,
    CONSTRAINT gpkg_contents_data_type_check CHECK (data_type IN ('features','tiles','attributes'))
  )`);
  db.run(`CREATE TABLE gpkg_geometry_columns (
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    geometry_type_name TEXT NOT NULL,
    srs_id INTEGER NOT NULL,
    z INTEGER NOT NULL,
    m INTEGER NOT NULL,
    CONSTRAINT gpkg_geometry_columns_pk PRIMARY KEY (table_name, column_name)
  )`);
}

function lisaaTaso(
  db: Tietokanta,
  nimi: string,
  kuvaus: string,
  geometria: string,
  sarakkeet: string,
  laatikko: Laatikko | null,
  nyt: string,
) {
  db.run(
    `CREATE TABLE ${nimi} (
      fid INTEGER PRIMARY KEY AUTOINCREMENT,
      geom BLOB,
      ${sarakkeet}
    )`,
  );
  db.run(
    `INSERT INTO gpkg_geometry_columns
      (table_name, column_name, geometry_type_name, srs_id, z, m)
      VALUES (?, 'geom', ?, ?, 0, 0)`,
    [nimi, geometria, SRS_ID],
  );
  db.run(
    `INSERT INTO gpkg_contents
      (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
      VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nimi,
      nimi,
      kuvaus,
      nyt,
      laatikko?.minX ?? null,
      laatikko?.minY ?? null,
      laatikko?.maxX ?? null,
      laatikko?.maxY ?? null,
      SRS_ID,
    ],
  );
}

function teksti(arvo: string | number | null | undefined): string | number | null {
  if (arvo == null) return null;
  return arvo;
}

export async function rakennaHankkeetGeopackage(hankkeet: AvoinDataHanke[]): Promise<Uint8Array> {
  const SQL = await lataaSqlJs();
  const db = new SQL.Database();
  const nyt = new Date().toISOString();
  luoPerustaulu(db);

  let pisteLaatikko: Laatikko | null = null;
  let alueLaatikko: Laatikko | null = null;
  let viivaLaatikko: Laatikko | null = null;
  const pisteet: (string | number | null | Uint8Array)[][] = [];
  const alueet: (string | number | null | Uint8Array)[][] = [];
  const viivat: (string | number | null | Uint8Array)[][] = [];

  for (const rivi of hankkeet) {
    const hanke = rivi.hanke;
    const yhteiset: (string | number | null)[] = [
      hanke.id,
      hanke.nimi,
      hanke.kunta,
      hanke.maakunta,
      hanke.vaihe,
      teksti(hanke.teho_mw),
      teksti(hanke.it_teho_mw),
      teksti(hanke.pinta_ala_ha),
      teksti(hanke.sahkonkaytto_twh_a),
      hanke.toimija?.nimi ?? null,
      rivi.linkit.json,
    ];

    if (hanke.sijainti_lon != null && hanke.sijainti_lat != null) {
      const lon = Number(hanke.sijainti_lon);
      const lat = Number(hanke.sijainti_lat);
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        const laajuus: [number, number, number, number] = [lon, lon, lat, lat];
        pisteLaatikko = laajenna(pisteLaatikko, laajuus);
        pisteet.push([kuori(wkbPiste(lon, lat), laajuus), ...yhteiset]);
      }
    }

    const alue = hanke.sijainti_alue;
    if (alue?.type === "Polygon" && alue.coordinates.length > 0) {
      const laajuus = laajuusPisteista(alue.coordinates.flat());
      alueLaatikko = laajenna(alueLaatikko, laajuus);
      alueet.push([kuori(wkbPolygoni(alue.coordinates), laajuus), ...yhteiset]);
    }

    for (const johto of rivi.johdot) {
      if (!johto.reitti) continue;
      const geometria = viivanPisteet(johto.reitti);
      if (!geometria) continue;
      viivaLaatikko = laajenna(viivaLaatikko, geometria.laajuus);
      viivat.push([
        kuori(geometria.wkb, geometria.laajuus),
        johto.id,
        hanke.id,
        hanke.nimi,
        johto.tyyppi,
        johto.vaihtoehto,
        teksti(johto.jannite_kv),
        teksti(johto.pituus_km),
      ]);
    }
  }

  const hankeSarakkeet = `hanke_id TEXT NOT NULL,
    nimi TEXT NOT NULL,
    kunta TEXT,
    maakunta TEXT,
    vaihe TEXT,
    teho_mw REAL,
    it_teho_mw REAL,
    pinta_ala_ha REAL,
    sahkonkaytto_twh_a REAL,
    toimija_nimi TEXT,
    json_url TEXT`;

  lisaaTaso(
    db,
    "hankkeet_pisteet",
    "Julkaistut hankkeet pistetaulukkona",
    "POINT",
    hankeSarakkeet,
    pisteLaatikko,
    nyt,
  );
  lisaaTaso(
    db,
    "hankkeet_alueet",
    "Julkaistut hankealueet",
    "POLYGON",
    hankeSarakkeet,
    alueLaatikko,
    nyt,
  );
  lisaaTaso(
    db,
    "johtoreitit",
    "Julkaistut sähkönsiirtoreitit",
    "GEOMETRY",
    `johto_id TEXT NOT NULL,
      hanke_id TEXT NOT NULL,
      hanke_nimi TEXT,
      tyyppi TEXT,
      vaihtoehto TEXT,
      jannite_kv REAL,
      pituus_km REAL`,
    viivaLaatikko,
    nyt,
  );

  const hankeSql = `INSERT INTO hankkeet_pisteet
    (geom, hanke_id, nimi, kunta, maakunta, vaihe, teho_mw, it_teho_mw, pinta_ala_ha, sahkonkaytto_twh_a, toimija_nimi, json_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  for (const rivi of pisteet) db.run(hankeSql, rivi);
  const alueSql = hankeSql.replace("hankkeet_pisteet", "hankkeet_alueet");
  for (const rivi of alueet) db.run(alueSql, rivi);
  for (const rivi of viivat) {
    db.run(
      `INSERT INTO johtoreitit
        (geom, johto_id, hanke_id, hanke_nimi, tyyppi, vaihtoehto, jannite_kv, pituus_km)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      rivi,
    );
  }

  const tavuina = db.export();
  db.close();
  return tavuina;
}
