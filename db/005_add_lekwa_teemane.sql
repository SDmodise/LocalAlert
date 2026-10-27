-- Adds Lekwa-Teemane Local Municipality (Christiana and Bloemhof, North West) for testing.
-- The centre point is APPROXIMATE (between Christiana and Bloemhof).
-- No neighbour pairs are added yet, so Levels 2 and 3 reach no extra municipalities
-- for alerts that start here; Level 4 still reaches all users.
BEGIN;
INSERT INTO municipalities (municipality_code, municipality_name, municipality_type, province, centroid_latitude, centroid_longitude)
VALUES ('NW396', 'Lekwa-Teemane', 'local', 'North West', -27.78000000, 25.38000000)
ON CONFLICT (municipality_code) DO UPDATE
  SET centroid_latitude  = EXCLUDED.centroid_latitude,
      centroid_longitude = EXCLUDED.centroid_longitude;
COMMIT;
