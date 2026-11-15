-- 013 pametni atributi: predefinirani polji podjetje in država (specs/013-pametni-atributi/data-model.md).
-- Samo dodajanje nullable stolpcev: obstoječe vrstice ostanejo nespremenjene (FR-013-02). Država je koda ISO 3166-1
-- alpha-2; uradno dodeljeno kodo preveri aplikacija, CHECK je varovalka oblike.

ALTER TABLE contact
    ADD COLUMN company text CHECK (company IS NULL OR char_length(company) BETWEEN 1 AND 200),
    ADD COLUMN country text CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
