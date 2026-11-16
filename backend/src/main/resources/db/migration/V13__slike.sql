-- 018 slike: slika uporabnika, skupine in kontakta v PostgreSQL za vmesnikom ImageStore
-- (specs/018-slike/data-model.md; research R-01, R-07). Samo naprej.
-- Številka je začasna (V13 je rezervirana za 016); ob združitvi se vzame naslednja prosta po origin/main.

CREATE TABLE image (
    id          uuid        PRIMARY KEY DEFAULT uuidv7(),
    kind        text        NOT NULL CHECK (kind IN ('USER', 'GROUP', 'CONTACT')),
    user_id     bigint      REFERENCES app_user (id) ON DELETE CASCADE,
    group_id    uuid        REFERENCES contact_group (id) ON DELETE CASCADE,
    -- Brez tujega ključa: kontakt je lahko izbrisan in obnovljen z istim id (kot audit_change).
    contact_id  uuid,
    -- Izpolnjeno, dokler kontakt ne obstaja (sprožilca na contact spodaj).
    detached_at timestamptz,
    revision    bigint      NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT image_owner CHECK (
        (kind = 'USER' AND user_id IS NOT NULL AND group_id IS NULL AND contact_id IS NULL)
        OR (kind = 'GROUP' AND user_id IS NULL AND group_id IS NOT NULL AND contact_id IS NULL)
        OR (kind = 'CONTACT' AND user_id IS NULL AND group_id IS NOT NULL AND contact_id IS NOT NULL)),
    CONSTRAINT image_detached CHECK (kind = 'CONTACT' OR detached_at IS NULL)
);

-- Ena slika na lastnika.
CREATE UNIQUE INDEX image_user_unique ON image (user_id) WHERE kind = 'USER';
CREATE UNIQUE INDEX image_group_unique ON image (group_id) WHERE kind = 'GROUP';
CREATE UNIQUE INDEX image_contact_unique ON image (group_id, contact_id) WHERE kind = 'CONTACT';

CREATE TABLE image_variant (
    image_id     uuid     NOT NULL REFERENCES image (id) ON DELETE CASCADE,
    size         smallint NOT NULL CHECK (size IN (96, 256, 512)),
    content_type text     NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    data         bytea    NOT NULL,
    PRIMARY KEY (image_id, size)
);

-- Dejstvo spremembe slike kontakta v sledi (vnos UPDATE z nespremenjenimi polji); vsebina slike ni v sledi.
ALTER TABLE audit_entry
    ADD COLUMN photo_change text CHECK (photo_change IN ('ADDED', 'REPLACED', 'REMOVED'));

-- Slika sledi kontaktu: izbris (tudi množični, rollback, izbris skupine) jo odklopi, obnova ali ponovna
-- ustvaritev kontakta z istim id jo priklopi. Vrstična sprožilca; pogoj vedno vsebuje group_id in contact_id.
CREATE FUNCTION image_detach_on_contact_delete() RETURNS trigger AS $$
BEGIN
    UPDATE image SET detached_at = now()
     WHERE kind = 'CONTACT' AND group_id = OLD.group_id AND contact_id = OLD.id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION image_attach_on_contact_insert() RETURNS trigger AS $$
BEGIN
    UPDATE image SET detached_at = NULL
     WHERE kind = 'CONTACT' AND group_id = NEW.group_id AND contact_id = NEW.id AND detached_at IS NOT NULL;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER image_detach_contact AFTER DELETE ON contact
    FOR EACH ROW EXECUTE FUNCTION image_detach_on_contact_delete();
CREATE TRIGGER image_attach_contact AFTER INSERT ON contact
    FOR EACH ROW EXECUTE FUNCTION image_attach_on_contact_insert();
