package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.invitation.support.InvitationApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Endpointi uporabnika {@code GET /api/invitations}, {@code /count}, {@code POST …/accept}, {@code …/decline}
 * (FR-006-05, FR-006-06, FR-006-08, FR-006-10, FR-006-11; feature-map §2.2): neprijavljen 401, tuje povabilo 404.
 */
class ReceivedInvitationSecurityIT extends InvitationApiTest {

    enum Anonymous {
        NO_TOKEN,
        MALFORMED_TOKEN,
        EXPIRED_TOKEN
    }

    enum Endpoint {
        LIST("GET", "/api/invitations"),
        COUNT("GET", "/api/invitations/count"),
        ACCEPT("POST", "/api/invitations/%s/accept"),
        DECLINE("POST", "/api/invitations/%s/decline");

        final String method;
        final String path;

        Endpoint(String method, String path) {
            this.method = method;
            this.path = path;
        }
    }

    private static Map<String, String> headers(Anonymous actor, SignedIn any) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(any.idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
        };
    }

    @ParameterizedTest(name = "{0} → 401")
    @EnumSource(Anonymous.class)
    @Tag("FR-006-05")
    @Tag("FR-006-06")
    @Tag("FR-006-08")
    @Tag("FR-006-10")
    void everyEndpointRequiresSignIn(Anonymous actor) throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        for (Endpoint endpoint : Endpoint.values()) {
            HttpResponse<String> response =
                    Http.send(endpoint.method, url(endpoint.path.formatted(invitation)), headers(actor, invitee));

            assertThat(response.statusCode()).as("%s", endpoint).isEqualTo(401);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "UNAUTHENTICATED"));
        }
        assertThat(invitations.exists(invitation)).isTrue();
        assertThat(invitations.memberRole(group, id(invitee))).isEmpty();
    }

    @Test
    @Tag("FR-006-11")
    void anotherUserCannotAcceptOrDeclineSomeoneElsesInvitation() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        SignedIn intruder = registeredUser("Vsiljivec");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");

        HttpResponse<String> accept = accept(invitation, intruder);
        HttpResponse<String> decline = decline(invitation, intruder);

        for (HttpResponse<String> response : java.util.List.of(accept, decline)) {
            assertThat(response.statusCode()).isEqualTo(404);
            assertThat(response.body()).isEmpty();
        }
        assertThat(invitations.exists(invitation)).isTrue();
        assertThat(invitations.memberRole(group, id(intruder))).isEmpty();
        assertThat(json(get("/api/invitations/count", intruder.idToken()).body()))
                .containsEntry("count", 0);
        assertThat(json(get("/api/invitations", intruder.idToken()).body())).containsEntry("total", 0);
        assertThat(json(get("/api/invitations/count", invitee.idToken()).body()))
                .containsEntry("count", 1);
    }

    @Test
    @Tag("FR-006-11")
    void processedMissingAndMalformedInvitationsAre404() throws Exception {
        SignedIn owner = registeredUser("Ana Novak");
        SignedIn invitee = registeredUser("Eva Povabljena");
        UUID group = groups.createGroup(id(owner), "Projekt FERI");
        UUID invitation = invitations.invite(group, id(invitee), id(owner), "EDITOR");
        assertThat(accept(invitation, invitee).statusCode()).isEqualTo(200);

        for (Object target : java.util.List.of(invitation, UUID.randomUUID(), "ni-uuid")) {
            HttpResponse<String> accept = accept(target, invitee);
            HttpResponse<String> decline = decline(target, invitee);

            assertThat(accept.statusCode()).as("accept %s", target).isEqualTo(404);
            assertThat(accept.body()).isEmpty();
            assertThat(decline.statusCode()).as("decline %s", target).isEqualTo(404);
            assertThat(decline.body()).isEmpty();
        }
    }

    @Test
    @Tag("FR-006-11")
    void aUserWithoutProfileGets404OnAcceptAndDecline() throws Exception {
        SignedIn noProfile = newGoogleUser("Brez Profila");

        assertThat(accept(UUID.randomUUID(), noProfile).statusCode()).isEqualTo(404);
        assertThat(decline(UUID.randomUUID(), noProfile).statusCode()).isEqualTo(404);
    }
}
