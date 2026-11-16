-- 014 uvoz in izvoz: vrsta vnosa sledi IMPORT, gesla za aplikacijo in zaklep prijave CardDAV
-- (specs/014-uvoz-izvoz/data-model.md; docs/decisions/2026-11-15-gesla-za-aplikacijo-carddav.md).
-- Samo naprej: obstoječi vnosi sledi ostanejo nespremenjeni, nespremenljivost (sprožilci V5) velja naprej.
-- Preštevilčeno iz V11 (V11 je 015 napredna revizija): CHECK je unija vseh vrst dejanj (tudi RESTORE iz V11).

ALTER TABLE audit_entry DROP CONSTRAINT audit_entry_action_check;
ALTER TABLE audit_entry ADD CONSTRAINT audit_entry_action_check
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'MERGE', 'ROLLBACK', 'RESTORE', 'IMPORT'));

-- Geslo za aplikacijo (FR-014-21, -25): hrani se samo SHA-256 normaliziranega gesla; preklic = izbris vrstice;
-- izbris računa kaskadno izbriše vsa gesla. Meja 10 na uporabnika se preveri v aplikaciji pod zaklepom app_user.
CREATE TABLE app_password (
    id           uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id      bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    name         text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    secret_hash  bytea       NOT NULL CHECK (octet_length(secret_hash) = 32),
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);

CREATE INDEX app_password_user ON app_password (user_id, created_at);

-- Zaklep prijave CardDAV (FR-014-26): 10 zaporednih neuspehov v 15 minutah zaklene prijavo za 15 minut.
CREATE TABLE dav_login_state (
    user_id           bigint      PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    failed_count      integer     NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    window_started_at timestamptz,
    locked_until      timestamptz
);
