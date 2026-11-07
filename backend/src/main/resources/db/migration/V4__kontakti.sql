-- 004 kontakti: kontakti skupine, dodatni atributi in značke (specs/004-kontakti/data-model.md; D-38, D-39).
-- Vse tri tabele so v verigi ON DELETE CASCADE iz contact_group (izbris skupine, 003).

CREATE TABLE contact (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    group_id    uuid        NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    first_name  text        CHECK (first_name IS NULL OR char_length(first_name) BETWEEN 1 AND 100),
    last_name   text        CHECK (last_name IS NULL OR char_length(last_name) BETWEEN 1 AND 100),
    address     text        CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 300),
    email       text        CHECK (email IS NULL OR char_length(email) BETWEEN 1 AND 254),
    phone       text        CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 30),
    -- Ključa razvrščanja: mala črka priimka in imena, razvrščeno po kodnih točkah (D-38); NULL = prazno (na koncu).
    sort_last   text        COLLATE "C",
    sort_first  text        COLLATE "C",
    version     bigint      NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  bigint      REFERENCES app_user (id) ON DELETE SET NULL,
    CONSTRAINT contact_has_name CHECK (first_name IS NOT NULL OR last_name IS NOT NULL)
);

CREATE INDEX contact_group_sort ON contact (group_id, sort_last, sort_first, created_at, id);

CREATE TABLE contact_attribute (
    contact_id uuid    NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
    position   integer NOT NULL,
    key        text    NOT NULL CHECK (char_length(key) BETWEEN 1 AND 50),
    key_norm   text    NOT NULL,
    value      text    NOT NULL CHECK (char_length(value) BETWEEN 1 AND 500),
    PRIMARY KEY (contact_id, position),
    UNIQUE (contact_id, key_norm)
);

CREATE TABLE contact_tag (
    contact_id uuid    NOT NULL REFERENCES contact (id) ON DELETE CASCADE,
    position   integer NOT NULL,
    tag        text    NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 50),
    tag_norm   text    NOT NULL,
    PRIMARY KEY (contact_id, position),
    UNIQUE (contact_id, tag_norm)
);

CREATE INDEX contact_tag_norm ON contact_tag (tag_norm, contact_id);
