-- 012 moji podatki: nadgrobnik izbrisane identitete, prepoved ponovne registracije in indeksi za ON DELETE SET NULL
-- (specs/012-moji-podatki/data-model.md; D-72).

-- Firebase UID izbrisanih uporabnikov: razveljavitev ID žetonov (FR-012-15) in sled neizpolnjenega brisanja pri ponudniku (FR-012-14).
-- Hrani samo psevdonimni UID (ne imena, ne e-naslova).
CREATE TABLE deleted_identity (
    firebase_uid        varchar(128) PRIMARY KEY,
    deleted_at          timestamptz  NOT NULL DEFAULT now(),
    provider_deleted_at timestamptz,
    attempts            integer      NOT NULL DEFAULT 0,
    next_attempt_at     timestamptz  NOT NULL DEFAULT now(),
    last_error          varchar(40)
);

CREATE INDEX deleted_identity_pending ON deleted_identity (next_attempt_at) WHERE provider_deleted_at IS NULL;
CREATE INDEX deleted_identity_purge ON deleted_identity (provider_deleted_at) WHERE provider_deleted_at IS NOT NULL;

-- Račun z UID-jem iz nadgrobnika ne sme (znova) nastati: preverjanje ob potrditvi, ko je sočasni izbris že viden (R-03).
CREATE FUNCTION app_user_not_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM deleted_identity WHERE firebase_uid = NEW.firebase_uid) THEN
        RAISE EXCEPTION 'identity deleted' USING ERRCODE = 'CM401';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER app_user_not_deleted AFTER INSERT ON app_user
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_user_not_deleted();

-- Brez teh indeksov ON DELETE SET NULL pri izbrisu uporabnika prebere celotne tabele (R-05).
CREATE INDEX audit_entry_actor ON audit_entry (actor_id);
CREATE INDEX contact_updated_by ON contact (updated_by);
CREATE INDEX contact_group_updated_by ON contact_group (updated_by);
CREATE INDEX group_member_updated_by ON group_member (updated_by);
