-- 007 clani: opaken identifikator člana v API in sled zadnje spremembe vloge (specs/007-clani/data-model.md; D-58).
-- `version`, `role`, primarni ključ (group_id, user_id) in indeks group_member_one_owner ostanejo nespremenjeni.
-- Volatilni DEFAULT uuidv7() obstoječim članstvom dodeli različne vrednosti.
ALTER TABLE group_member
    ADD COLUMN id         uuid        NOT NULL DEFAULT uuidv7(),
    ADD COLUMN updated_at timestamptz,
    ADD COLUMN updated_by bigint      REFERENCES app_user (id) ON DELETE SET NULL;

ALTER TABLE group_member ADD CONSTRAINT group_member_id_key UNIQUE (id);
