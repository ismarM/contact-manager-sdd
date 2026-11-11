-- 008 iskanje, filtri in razvrščanje kontaktov (specs/008-iskanje/research.md R-01 do R-03; D-63, D-64).
-- V4 se ne spreminja: kolacija ključev razvrščanja se zamenja tukaj.
--
-- sort_sl: slovenska abeceda (Č za C, Š za S, Ž za Z), ne glede na velikost črk, neodvisno od jezika vmesnika.
--   Moč »secondary« (ks-level2) prezre samo velikost črk; nedeterministična, zato se uporablja samo za ORDER BY in indeks.
-- search_fold: iskanje in pogoji brez razlike velikosti črk in strešic (moč »primary«, ks-level1); uporablja se s strpos().
CREATE COLLATION sort_sl (provider = icu, locale = 'sl-u-ks-level2', deterministic = false);
CREATE COLLATION search_fold (provider = icu, locale = 'und-u-ks-level1', deterministic = false);

-- Vrednosti ključev (male črke priimka in imena, NULL za prazno) ostanejo; PostgreSQL ob tem prepiše tabelo (zaklep
-- ACCESS EXCLUSIVE za čas prepisa) in obnovi indeks contact_group_sort.
ALTER TABLE contact
    ALTER COLUMN sort_last TYPE text COLLATE sort_sl,
    ALTER COLUMN sort_first TYPE text COLLATE sort_sl;

-- Pogoji in razvrščanje po dodatnem ključu, preverjanje obstoja ključa v skupini, seznam ključev.
CREATE INDEX contact_attribute_key ON contact_attribute (key_norm, contact_id);
