package si.contactmanager.account;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Izvoz mojih podatkov (contracts/openapi.yaml – MyData): kode in ISO 8601 datumi, brez notranjih identifikatorjev. */
public record MyData(
        int formatVersion,
        Instant exportedAt,
        Profile profile,
        List<Membership> memberships,
        List<ReceivedInvitation> receivedInvitations,
        List<SentInvitation> sentInvitations,
        List<OwnedGroup> ownedGroups,
        List<AppPassword> appPasswords,
        List<ApiKey> apiKeys) {

    /**
     * Profil: nastavitve vmesnika (001), oblike zapisa (016, FR-016-17; {@code null} = privzeto) in lastna profilna
     * slika ({@code photo}, 018, FR-018-18; {@code null} = brez slike). Slike kontaktov in skupin niso del izvoza.
     */
    public record Profile(
            String name,
            String email,
            Instant registeredAt,
            String language,
            String theme,
            String phoneFormat,
            String dateFormat,
            String addressFormat,
            Photo photo) {

        public Profile(
                String name,
                String email,
                Instant registeredAt,
                String language,
                String theme,
                String phoneFormat,
                String dateFormat,
                String addressFormat) {
            this(name, email, registeredAt, language, theme, phoneFormat, dateFormat, addressFormat, null);
        }
    }

    /** Obdelana slika (različica 512) kot base64. */
    public record Photo(String contentType, String base64) {}

    public record Membership(String groupTitle, String role, Instant joinedAt, String state) {}

    /** Izbrisan pošiljatelj: {@code name = »izbrisan uporabnik«}, {@code deleted = true}; brez e-naslova (FR-012-03). */
    public record Sender(String name, boolean deleted) {}

    public record ReceivedInvitation(String groupTitle, String offeredRole, Sender sender, Instant createdAt) {}

    public record SentInvitation(String groupTitle, String offeredRole, String inviteeEmail, Instant createdAt) {}

    public record OwnedGroup(String title, String description, String color, String state, Instant createdAt) {}

    /** Geslo za aplikacijo (014, FR-014-25): ime in časi, nikoli geslo ali zgoščena vrednost. */
    public record AppPassword(String name, Instant createdAt, Instant lastUsedAt) {}

    /**
     * API ključ (019, FR-019-05, -21): ime, obseg, časi in dnevni povzetki statistike; nikoli ključ ali prepoznavni del.
     * {@code allGroupsPermission} je {@code null}, kadar ključ velja za izbrane skupine.
     */
    public record ApiKey(
            String name,
            boolean allGroups,
            String allGroupsPermission,
            List<ApiKeyGroup> groups,
            Instant createdAt,
            Instant expiresAt,
            Instant lastUsedAt,
            Instant revokedAt,
            List<ApiKeyUsageDay> usage) {}

    public record ApiKeyGroup(String title, String permission) {}

    /** Dnevni povzetek v časovnem pasu statistike ({@code api-keys.stats-zone}). */
    public record ApiKeyUsageDay(LocalDate day, int readOk, int writeOk, int errors, int rateLimited) {}
}
