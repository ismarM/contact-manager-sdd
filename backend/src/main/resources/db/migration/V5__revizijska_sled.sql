-- 005 revizijska sled: vnosi, spremembe in glava sledi (specs/005-revizijska-sled/data-model.md; research R-01, R-02, R-07).
-- Vse tri tabele so v verigi ON DELETE CASCADE iz contact_group (izbris skupine izbriše sled, FR-005-05, 003 FR-003-11).

CREATE TABLE audit_entry (
    id              uuid        PRIMARY KEY DEFAULT uuidv7(),
    group_id        uuid        NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    -- Zaporedna številka v skupini (iz audit_head); edini vrstni red sledi, čas je samo za prikaz.
    seq             bigint      NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    actor_id        bigint      REFERENCES app_user (id) ON DELETE SET NULL,
    action          text        NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'MERGE', 'ROLLBACK')),
    contact_count   integer     NOT NULL CHECK (contact_count >= 1),
    contact_name    text,
    target_entry_id uuid        REFERENCES audit_entry (id),
    target_initial  boolean     NOT NULL DEFAULT false,
    UNIQUE (group_id, seq),
    CONSTRAINT audit_entry_target CHECK (
        (action = 'ROLLBACK' AND ((target_entry_id IS NOT NULL) <> target_initial))
        OR (action <> 'ROLLBACK' AND target_entry_id IS NULL AND NOT target_initial))
);

CREATE INDEX audit_entry_group_seq ON audit_entry (group_id, seq DESC);
CREATE INDEX audit_entry_group_action ON audit_entry (group_id, action, seq DESC);

CREATE TABLE audit_change (
    entry_id     uuid    NOT NULL REFERENCES audit_entry (id) ON DELETE CASCADE,
    position     integer NOT NULL,
    -- Brez tujega ključa: kontakt je lahko izbrisan in pozneje obnovljen z istim id (FR-005-11).
    contact_id   uuid    NOT NULL,
    display_name text    NOT NULL,
    before       jsonb,
    after        jsonb,
    PRIMARY KEY (entry_id, position),
    UNIQUE (entry_id, contact_id),
    CONSTRAINT audit_change_state CHECK (before IS NOT NULL OR after IS NOT NULL)
);

CREATE INDEX audit_change_contact ON audit_change (contact_id, entry_id);

CREATE TABLE audit_head (
    group_id      uuid   PRIMARY KEY REFERENCES contact_group (id) ON DELETE CASCADE,
    last_seq      bigint NOT NULL,
    last_entry_id uuid   NOT NULL REFERENCES audit_entry (id) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE contact
    ADD COLUMN reverted_entry_id uuid REFERENCES audit_entry (id) ON DELETE SET NULL;

-- Nespremenljivost (FR-005-05, R-07): posodobitev je zavrnjena. Edina izjema je kaskada ON DELETE SET NULL pri
-- izbrisu računa izvajalca (actor_id → NULL, »izbrisan uporabnik«); sprožilca za DELETE ni, da kaskadni izbris skupine deluje.
CREATE FUNCTION audit_entry_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND to_jsonb(NEW) - 'actor_id' = to_jsonb(OLD) - 'actor_id' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'audit_entry je nespremenljiv (FR-005-05)';
END;
$$;

CREATE TRIGGER audit_entry_immutable BEFORE UPDATE ON audit_entry
    FOR EACH ROW EXECUTE FUNCTION audit_entry_immutable();

CREATE FUNCTION audit_change_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_change je nespremenljiv (FR-005-05)';
END;
$$;

CREATE TRIGGER audit_change_immutable BEFORE UPDATE ON audit_change
    FOR EACH ROW EXECUTE FUNCTION audit_change_immutable();
