-- Erota sijaintiperustelu (siting) sijaintikuvauksesta (huomautus).

COMMENT ON COLUMN hankkeet.sijaintiperustelu IS
  'Miksi hanke sijoittuu valittuun paikkaan (siting-perustelu YVA-asiakirjoista). '
  'Lainaus pakollinen (sitaatti, ei mittaluku). '
  'Ei sijaintikuvausta kuten «noin 5 km pohjoiseen» — se kuuluu huomautukseen. '
  'Ilman YVA-menettelyä kenttä jää tyhjäksi.';

COMMENT ON COLUMN hankkeet.huomautus IS
  'Julkinen huomautus hankkeesta. Sisältää myös sijaintikuvauksen '
  '(esim. «noin 5 km kuntakeskuksesta pohjoiseen»), kun tarkkaa pistettä ei ole. '
  'Älä sekoita sijaintiperusteluun (miksi paikka valittiin).';
