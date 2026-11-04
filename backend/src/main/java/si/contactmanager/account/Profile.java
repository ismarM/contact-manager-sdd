package si.contactmanager.account;

/** Profil prijavljenega uporabnika (contracts/openapi.yaml – Profile); brez identifikatorjev (FR-001-08). */
public record Profile(String name, String email, Language language, Theme theme) {}
