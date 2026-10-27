-- Sign-up support:
--  1. Records when a user accepted the privacy notice (FR28, POPIA).
--  2. Adds the pilot municipalities around Tshwane with APPROXIMATE centre points,
--     used by the prototype's nearest-centre municipality lookup.
--     Replace with Municipal Demarcation Board boundary data when it is added.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMP;

INSERT INTO municipalities (municipality_code, municipality_name, municipality_type, province, centroid_latitude, centroid_longitude) VALUES
  ('TSH',   'City of Tshwane',       'metro', 'Gauteng',    -25.55000000, 28.30000000),
  ('JHB',   'City of Johannesburg',  'metro', 'Gauteng',    -26.17000000, 28.00000000),
  ('EKU',   'City of Ekurhuleni',    'metro', 'Gauteng',    -26.17000000, 28.33000000),
  ('NW371', 'Moretele',              'local', 'North West', -25.30000000, 28.05000000),
  ('NW372', 'Madibeng',              'local', 'North West', -25.60000000, 27.80000000),
  ('GT481', 'Mogale City',           'local', 'Gauteng',    -26.00000000, 27.70000000)
ON CONFLICT (municipality_code) DO UPDATE
  SET centroid_latitude  = EXCLUDED.centroid_latitude,
      centroid_longitude = EXCLUDED.centroid_longitude;

SELECT add_neighbour_pair('TSH',   'NW371');
SELECT add_neighbour_pair('TSH',   'NW372');
SELECT add_neighbour_pair('TSH',   'GT481');
SELECT add_neighbour_pair('JHB',   'GT481');
SELECT add_neighbour_pair('NW371', 'NW372');
SELECT add_neighbour_pair('NW372', 'GT481');

COMMIT;
