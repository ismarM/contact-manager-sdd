package si.contactmanager.account;

import java.time.Instant;
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
        List<AppPassword> appPasswords) {

    public record Profile(String name, String email, Instant registeredAt, String language, String theme) {}

    public record Membership(String groupTitle, String role, Instant joinedAt, String state) {}

    /** Izbrisan pošiljatelj: {@code name = »izbrisan uporabnik«}, {@code deleted = true}; brez e-naslova (FR-012-03). */
    public record Sender(String name, boolean deleted) {}

    public record ReceivedInvitation(String groupTitle, String offeredRole, Sender sender, Instant createdAt) {}

    public record SentInvitation(String groupTitle, String offeredRole, String inviteeEmail, Instant createdAt) {}

    public record OwnedGroup(String title, String description, String color, String state, Instant createdAt) {}

    /** Geslo za aplikacijo (014, FR-014-25): ime in časi, nikoli geslo ali zgoščena vrednost. */
    public record AppPassword(String name, Instant createdAt, Instant lastUsedAt) {}
}
