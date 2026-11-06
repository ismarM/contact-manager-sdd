-- 002 skupine: skupine in članstva (specs/002-skupine/data-model.md; D-27, D-28).

-- Abecedni red naslovov po pravilih jezika vmesnika (research R-04).
CREATE COLLATION title_sl (provider = icu, locale = 'sl');
CREATE COLLATION title_en (provider = icu, locale = 'en');

CREATE TABLE contact_group (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
    description text        CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
    color       varchar(6)  NOT NULL DEFAULT 'tinta'
                            CHECK (color IN ('tinta', 'mah', 'opeka', 'oker', 'sliva', 'morje', 'grafit', 'rja')),
    version     bigint      NOT NULL DEFAULT 0,
    -- Piše ga samo 003 (arhiviranje); 002 ga le bere (D-27).
    archived_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  bigint      REFERENCES app_user (id) ON DELETE SET NULL
);

CREATE TABLE group_member (
    group_id   uuid        NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    user_id    bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    role       varchar(6)  NOT NULL CHECK (role IN ('VIEWER', 'EDITOR', 'ADMIN', 'OWNER')),
    version    bigint      NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

CREATE UNIQUE INDEX group_member_one_owner ON group_member (group_id) WHERE role = 'OWNER';
CREATE INDEX group_member_user_role ON group_member (user_id, role);
