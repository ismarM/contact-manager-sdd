package si.contactmanager.shared.security;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Klicatelj z API ključem na {@code /v1/**} (019, research R-02, R-04): lastnik ključa, id ključa ({@code jti}), ime ključa
 * (za revizijsko sled) in obseg iz podpisanega žetona. Nastavi ga {@code ApiKeyAuthenticationFilter}; drugje ga ni.
 */
public record ApiKeyPrincipal(long userId, UUID keyId, String keyName, Scope scope) {

    /** Pravica ključa za skupino. */
    public enum Permission {
        READ,
        WRITE
    }

    /**
     * Obseg ključa: {@code all} ≠ {@code null} pomeni »vse moje skupine, tudi prihodnje« z eno pravico, sicer veljajo
     * samo naštete skupine.
     */
    public record Scope(Permission all, Map<UUID, Permission> groups) {

        public Scope {
            groups = Map.copyOf(groups);
            if ((all == null) == groups.isEmpty()) {
                throw new IllegalArgumentException("scope needs either all groups or at least one group");
            }
        }

        public static Scope allGroups(Permission permission) {
            return new Scope(Objects.requireNonNull(permission), Map.of());
        }

        public static Scope groups(Map<UUID, Permission> groups) {
            return new Scope(null, groups);
        }

        /** Pravica ključa za skupino ali prazno, če skupina ni v obsegu. */
        public Optional<Permission> permission(UUID groupId) {
            return all != null ? Optional.of(all) : Optional.ofNullable(groups.get(groupId));
        }
    }

    public ApiKeyPrincipal {
        Objects.requireNonNull(keyId);
        Objects.requireNonNull(keyName);
        Objects.requireNonNull(scope);
    }

    /** Klicatelj trenutne zahteve, če je to API ključ; v spletni aplikaciji in CardDAV prazno. */
    public static Optional<ApiKeyPrincipal> current() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof ApiKeyPrincipal principal
                ? Optional.of(principal)
                : Optional.empty();
    }
}
