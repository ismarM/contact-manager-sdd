-- 019 API ključi (specs/019-api-kljuci/data-model.md). Ključ sam (cmk_ + JWT) in njegova zgoščena vrednost se ne
-- hranita; vrstica po jti nosi ime, prikaz, preklic in statistiko. Izbris računa kaskadno izbriše ključe in statistiko.
CREATE TABLE api_key (
    id                    uuid        PRIMARY KEY DEFAULT uuidv7(),
    user_id               bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    name                  text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    hint                  text        NOT NULL CHECK (char_length(hint) = 6),
    all_groups            boolean     NOT NULL,
    all_groups_permission text        CHECK (all_groups_permission IN ('READ', 'WRITE')),
    created_at            timestamptz NOT NULL DEFAULT now(),
    expires_at            timestamptz,
    last_used_at          timestamptz,
    revoked_at            timestamptz,
    CONSTRAINT api_key_all_groups_permission CHECK (all_groups = (all_groups_permission IS NOT NULL))
);

CREATE INDEX api_key_user ON api_key (user_id, created_at);

-- Prikazni obseg (avtorizacija uporablja trditev scp v podpisanem žetonu); samo, kadar all_groups = false.
CREATE TABLE api_key_group (
    key_id     uuid NOT NULL REFERENCES api_key (id) ON DELETE CASCADE,
    group_id   uuid NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    permission text NOT NULL CHECK (permission IN ('READ', 'WRITE')),
    PRIMARY KEY (key_id, group_id)
);

CREATE INDEX api_key_group_group ON api_key_group (group_id);

-- Statistika po urah (začetek ure, UTC); hramba 90 dni (ApiKeyPurgeJob).
CREATE TABLE api_key_usage (
    key_id       uuid        NOT NULL REFERENCES api_key (id) ON DELETE CASCADE,
    hour         timestamptz NOT NULL,
    read_ok      integer     NOT NULL DEFAULT 0 CHECK (read_ok >= 0),
    write_ok     integer     NOT NULL DEFAULT 0 CHECK (write_ok >= 0),
    errors       integer     NOT NULL DEFAULT 0 CHECK (errors >= 0),
    rate_limited integer     NOT NULL DEFAULT 0 CHECK (rate_limited >= 0),
    PRIMARY KEY (key_id, hour)
);

-- Oznaka »prek API ključa« v revizijski sledi (FR-019-12, research R-04): posnetek imena; NULL za spletno aplikacijo.
ALTER TABLE audit_entry
    ADD COLUMN api_key_name text CHECK (api_key_name IS NULL OR char_length(api_key_name) BETWEEN 1 AND 50);

-- Sled ostane nespremenljiva (FR-005-05). Edina dovoljena posodobitev je actor_id → NULL ob izbrisu računa; ob njej se
-- počisti tudi ime ključa (osebni podatek izbrisanega uporabnika). Vse drugo, tudi sprememba samega imena, je prepovedano.
CREATE OR REPLACE FUNCTION audit_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND to_jsonb(NEW) - 'actor_id' - 'api_key_name' = to_jsonb(OLD) - 'actor_id' - 'api_key_name'
       AND NEW.api_key_name IS NOT DISTINCT FROM OLD.api_key_name THEN
        NEW.api_key_name := NULL;
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_entry je nespremenljiv (FR-005-05)';
END;
$$;
