/** Johda kuntasivun URL-tunniste suomenkielisestä nimestä. */

export function johdaKuntaSlug(nimi: string): string {
  const pohja = nimi
    .trim()
    .replace(/[ÄÅäå]/g, "a")
    .replace(/[Öö]/g, "o")
    .replace(/[Üü]/g, "u")
    .replace(/[Éé]/g, "e")
    .toLocaleLowerCase("fi")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return pohja;
}

export function kuntaSivuPolku(slug: string): string {
  return `/kunnat/${slug}`;
}
