-- Adds Raymond Mhlaba Local Municipality (EC129, Amathole District, Eastern Cape) for testing.
-- Towns: Fort Beaufort (seat), Alice, Adelaide, Bedford, Middledrift, Seymour, Hogsback.
-- Centre point: Fort Beaufort, 32°46'S 26°38'E (approximate; the area is about 6 358 km²,
-- so the 80 km nearest-centre lookup covers the whole municipality).
-- No neighbour pairs yet: its neighbours (e.g. Amahlathi, Ngqushwa, Makana, Enoch Mgijima)
-- are not in the database, so Levels 2 and 3 add no municipalities; Level 4 reaches all users.
BEGIN;
INSERT INTO municipalities (municipality_code, municipality_name, municipality_type, province, centroid_latitude, centroid_longitude)
VALUES ('EC129', 'Raymond Mhlaba', 'local', 'Eastern Cape', -32.76670000, 26.63330000)
ON CONFLICT (municipality_code) DO UPDATE
  SET municipality_name  = EXCLUDED.municipality_name,
      centroid_latitude  = EXCLUDED.centroid_latitude,
      centroid_longitude = EXCLUDED.centroid_longitude;
COMMIT;
