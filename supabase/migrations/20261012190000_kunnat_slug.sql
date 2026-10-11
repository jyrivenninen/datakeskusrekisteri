-- Kuntasivujen URL-tunniste. Johdetaan suomenkielisestä nimestä (nimi),
-- ei ruotsinkielisestä (nimi_sv). Ääkköset ja välilyönnit normalisoidaan.

CREATE OR REPLACE FUNCTION johda_kunta_slug(p_nimi text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both '-' FROM regexp_replace(
      regexp_replace(
        lower(translate(trim(p_nimi), 'ÄÖÅÜÉäöåüé', 'aoaueaoaue')),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      '-{2,}',
      '-',
      'g'
    )),
    ''
  );
$$;

COMMENT ON FUNCTION johda_kunta_slug(text) IS
  'Johda kuntasivun slug suomenkielisestä nimestä. Sama logiikka kuin src/lib/kunta-slug.ts.';

ALTER TABLE kunnat
  ADD COLUMN slug text;

UPDATE kunnat
SET slug = johda_kunta_slug(nimi)
WHERE slug IS NULL;

-- Harvinaiset törmäykset: lisää kuntakoodi.
UPDATE kunnat k
SET slug = johda_kunta_slug(k.nimi) || '-' || k.koodi
WHERE k.slug IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM kunnat k2
    WHERE k2.slug = k.slug
      AND k2.id <> k.id
  );

ALTER TABLE kunnat
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE kunnat
  ADD CONSTRAINT kunnat_slug_muoto CHECK (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  ADD CONSTRAINT kunnat_slug_yksilollinen UNIQUE (slug);

CREATE INDEX kunnat_slug_idx ON kunnat (slug);

COMMENT ON COLUMN kunnat.slug IS
  'URL-tunniste kuntasivulle (/kunnat/[slug]). Johdettu suomenkielisestä nimestä.';
