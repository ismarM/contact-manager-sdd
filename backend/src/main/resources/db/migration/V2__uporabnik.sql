-- 001 prijava: profil uporabnika (specs/001-prijava/data-model.md).
CREATE TABLE app_user (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    firebase_uid varchar(128) NOT NULL UNIQUE,
    name         text,
    email        varchar(254) NOT NULL,
    language     varchar(2)   CHECK (language IN ('sl', 'en')),
    theme        varchar(5)   CHECK (theme IN ('light', 'dark')),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_user_email_lower_key ON app_user (lower(email));
