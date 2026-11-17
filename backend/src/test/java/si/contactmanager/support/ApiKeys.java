package si.contactmanager.support;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import si.contactmanager.apikey.ApiKeyProperties;
import si.contactmanager.apikey.ApiKeyTokens;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;

/**
 * Testni API ključi (019): vrstica {@code api_key} (+ {@code api_key_group}) in podpisan žeton prek {@link ApiKeyTokens}
 * zaledja – brez endpointa za ustvarjanje. Za potekel, preklican ključ in ključ z drugim podpisnim ključem.
 */
public final class ApiKeys {

    /** Ustvarjen ključ: id vrstice ({@code jti}) in celoten ključ {@code cmk_…}. */
    public record Key(UUID id, String token) {}

    private final ApiKeyTokens tokens;
    private final JdbcTemplate jdbc;

    public ApiKeys(ApiKeyTokens tokens, JdbcTemplate jdbc) {
        this.tokens = tokens;
        this.jdbc = jdbc;
    }

    /** Id uporabnika ({@code app_user.id}) za Firebase UID; profil mora obstajati. */
    public long userId(String firebaseUid) {
        Long id = jdbc.queryForObject("select id from app_user where firebase_uid = ?", Long.class, firebaseUid);
        if (id == null) {
            throw new IllegalStateException("ni profila za " + firebaseUid);
        }
        return id;
    }

    /** Aktiven ključ z rokom 90 dni. */
    public Key create(long userId, String name, Scope scope) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        return create(tokens, userId, name, scope, now, now.plus(Duration.ofDays(90)));
    }

    /** Ključ za skupine z dano pravico. */
    public Key forGroups(long userId, Permission permission, UUID... groups) {
        Map<UUID, Permission> scope = new java.util.LinkedHashMap<>();
        for (UUID group : groups) {
            scope.put(group, permission);
        }
        return create(userId, "Testni ključ", Scope.groups(scope));
    }

    /** Ključ brez roka. */
    public Key withoutExpiry(long userId, Scope scope) {
        return create(tokens, userId, "Brez roka", scope, Instant.now().truncatedTo(ChronoUnit.SECONDS), null);
    }

    /** Ključ, ki mu je rok potekel pred eno uro (žeton in vrstica). */
    public Key expired(long userId, Scope scope) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        return create(tokens, userId, "Potekel", scope, now.minus(Duration.ofDays(30)), now.minus(Duration.ofHours(1)));
    }

    /** Preklican ključ (vrstica ima {@code revoked_at}). */
    public Key revoked(long userId, Scope scope) {
        Key key = create(userId, "Preklican", scope);
        revoke(key.id());
        return key;
    }

    public void revoke(UUID keyId) {
        jdbc.update("update api_key set revoked_at = now() where id = ?", keyId);
    }

    /** Ključ z obstoječo vrstico, a podpisan z drugo skrivnostjo (podpis ne ustreza). */
    public Key signedWithOtherSecret(long userId, Scope scope) {
        ApiKeyTokens other = new ApiKeyTokens(
                new ApiKeyProperties(
                        ApiKeySigningSecret.random(), 120, ZoneId.of("Europe/Ljubljana"), Duration.ofHours(1)),
                Clock.systemUTC());
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        return create(other, userId, "Drug podpis", scope, now, now.plus(Duration.ofDays(90)));
    }

    /** Pravilno podpisan ključ brez vrstice v bazi (npr. izbrisan s čiščenjem). */
    public String withoutRow(long userId, Scope scope) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        return tokens.issue(userId, UUID.randomUUID(), scope, now, now.plus(Duration.ofDays(90)));
    }

    /** Pravilno podpisan ključ z id-jem obstoječe vrstice, a drugim lastnikom v {@code sub}. */
    public String withOtherSubject(Key key, long otherUserId, Scope scope) {
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        return tokens.issue(otherUserId, key.id(), scope, now, now.plus(Duration.ofDays(90)));
    }

    private Key create(
            ApiKeyTokens signer, long userId, String name, Scope scope, Instant issuedAt, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        String token = signer.issue(userId, id, scope, issuedAt, expiresAt);
        jdbc.update(
                "insert into api_key (id, user_id, name, hint, all_groups, all_groups_permission, created_at,"
                        + " expires_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
                id,
                userId,
                name,
                token.substring(token.length() - 6),
                scope.all() != null,
                scope.all() == null ? null : scope.all().name(),
                Timestamp.from(issuedAt),
                expiresAt == null ? null : Timestamp.from(expiresAt));
        scope.groups()
                .forEach((group, permission) -> jdbc.update(
                        "insert into api_key_group (key_id, group_id, permission) values (?, ?, ?)",
                        id,
                        group,
                        permission.name()));
        return new Key(id, token);
    }
}
