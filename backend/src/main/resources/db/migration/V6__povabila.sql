-- 006 povabila: čakajoča povabila v skupino (specs/006-povabila/data-model.md; D-54, D-55).
-- Obdelano (sprejeto, zavrnjeno) ali umaknjeno povabilo se izbriše; tabela hrani samo čakajoča.

CREATE TABLE invitation (
    id         uuid        PRIMARY KEY DEFAULT uuidv7(),
    group_id   uuid        NOT NULL REFERENCES contact_group (id) ON DELETE CASCADE,
    invitee_id bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    inviter_id bigint      REFERENCES app_user (id) ON DELETE SET NULL,
    role       varchar(6)  NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invitation_one_pending UNIQUE (group_id, invitee_id)
);

CREATE INDEX invitation_invitee_created ON invitation (invitee_id, created_at DESC, id DESC);
CREATE INDEX invitation_inviter ON invitation (inviter_id);
