-- 016 tipizirani atributi (specs/016-tipizirani-atributi/data-model.md): tip ključa atributa v skupini, strukturiran
-- naslov, prikazne sheme osebe in polja sledi za spremembo tipa. Samo naprej: obstoječe vrednosti, verzije in posnetki
-- sledi ostanejo nespremenjeni (normalizacija le ob spremembi, FR-016-09).

CREATE TABLE attribute_key (
    group_id uuid   NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    key_norm text   NOT NULL,
    type     text   NOT NULL DEFAULT 'OTHER'
             CHECK (type IN ('OTHER', 'NOTES', 'EMAIL', 'PHONE', 'ADDRESS', 'URL', 'DATE')),
    version  bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, key_norm)
);

INSERT INTO attribute_key (group_id, key_norm)
SELECT DISTINCT c.group_id, a.key_norm
FROM contact_attribute a
         JOIN contact c ON c.id = a.contact_id;

-- Nerazčlenjen naslov ostane besedilo v address, razčlenjen so deli v address_parts (natanko eno od obeh).
ALTER TABLE contact
    ADD COLUMN address_parts jsonb CHECK (address_parts IS NULL OR jsonb_typeof(address_parts) = 'object'),
    ADD CONSTRAINT contact_address_one CHECK (address IS NULL OR address_parts IS NULL);

ALTER TABLE contact_attribute
    ADD COLUMN parts jsonb CHECK (parts IS NULL OR jsonb_typeof(parts) = 'object'),
    ALTER COLUMN value DROP NOT NULL,
    ADD CONSTRAINT contact_attribute_value_or_parts CHECK ((value IS NULL) <> (parts IS NULL));

-- Prikazne sheme (FR-016-16 … -18): NULL = privzeto.
ALTER TABLE app_user
    ADD COLUMN phone_format   varchar(13) CHECK (phone_format IN ('INTERNATIONAL', 'NATIONAL', 'E164')),
    ADD COLUMN date_format    varchar(6)  CHECK (date_format IN ('LOCALE', 'ISO', 'LONG')),
    ADD COLUMN address_format varchar(11) CHECK (address_format IN ('COUNTRY', 'SINGLE_LINE'));

-- Sprememba tipa ključa v sledi (FR-016-26): vrsta dejanja ATTRIBUTE_TYPE nosi ključ in tip pred/po.
ALTER TABLE audit_entry
    ADD COLUMN attribute_key text,
    ADD COLUMN type_before   text,
    ADD COLUMN type_after    text;

-- CHECK dejanj je unija vseh vrst do V12 (tudi RESTORE in IMPORT) + ATTRIBUTE_TYPE.
ALTER TABLE audit_entry DROP CONSTRAINT audit_entry_action_check;
ALTER TABLE audit_entry ADD CONSTRAINT audit_entry_action_check
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'MERGE', 'ROLLBACK', 'RESTORE', 'IMPORT', 'ATTRIBUTE_TYPE'));

ALTER TABLE audit_entry ADD CONSTRAINT audit_entry_attribute_type CHECK (
    (action = 'ATTRIBUTE_TYPE')
        = (attribute_key IS NOT NULL AND type_before IS NOT NULL AND type_after IS NOT NULL));
