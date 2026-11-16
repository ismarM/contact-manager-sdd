package si.contactmanager.account;

/**
 * Profil prijavljenega uporabnika (contracts/openapi.yaml – Profile); brez identifikatorjev (FR-001-08).
 * {@code photoRevision} je revizija profilne slike ({@code null} = brez slike, 018).
 */
public record Profile(String name, String email, Language language, Theme theme, Long photoRevision) {}
