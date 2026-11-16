package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Potrjen e-naslov je pogoj za ves API (FR-017-02, FR-017-04, spec – Negative Scenarios): veljaven žeton brez
 * {@code email_verified=true} dobi na vsaki vrsti klica {@code 403 EMAIL_NOT_VERIFIED}, nič se ne ustvari ali spremeni
 * (tudi profil ne); neveljaven žeton ostane 401; {@code GET /api/health} ostane javen; po potrditvi in novem žetonu
 * uporabnik vstopi in profil nastane.
 */
@Tag("FR-017-02")
@Tag("FR-017-04")
class EmailVerifiedSecurityIT extends ApiTest {

    private static final String GESLO = "geslo-12345678";

    /** Vrsta nepotrjenega, sicer veljavnega žetona. */
    enum Unverified {
        /** Pravi žeton emulatorja po registraciji z geslom ({@code email_verified=false}). */
        PASSWORD_SIGN_UP,
        /** Žeton brez zahtevka {@code email_verified}. */
        CLAIM_MISSING,
        /** Zahtevek kot niz {@code "true"} – ni logična vrednost, ni potrditev. */
        CLAIM_AS_STRING
    }

    record Call(String method, String path, String body) {
        @Override
        public String toString() {
            return method + " " + path;
        }
    }

    /** Reprezentativne poti vseh vrst klicev ({@code {g}} = obstoječa skupina drugega uporabnika). */
    static final List<Call> CALLS = List.of(
            new Call("PUT", "/api/me", null),
            new Call("PUT", "/api/me/preferences", "{\"language\":\"en\",\"theme\":\"dark\"}"),
            new Call("GET", "/api/me/export", null),
            new Call("GET", "/api/me/deletion-blockers", null),
            new Call("POST", "/api/me/deletion", "{}"),
            new Call("GET", "/api/me/app-passwords", null),
            new Call("POST", "/api/me/app-passwords", "{\"label\":\"Telefon\"}"),
            new Call("GET", "/api/groups", null),
            new Call("GET", "/api/groups/archived", null),
            new Call("POST", "/api/groups", "{\"title\":\"Nepotrjena\"}"),
            new Call("GET", "/api/groups/{g}", null),
            new Call("PUT", "/api/groups/{g}", "{\"title\":\"Prevzeta\",\"version\":0}"),
            new Call("DELETE", "/api/groups/{g}", null),
            new Call("POST", "/api/groups/{g}/archive", null),
            new Call("GET", "/api/groups/{g}/members", null),
            new Call("POST", "/api/groups/{g}/leave", null),
            new Call("GET", "/api/groups/{g}/contacts", null),
            new Call("PATCH", "/api/groups/{g}", "{}"),
            new Call("GET", "/api/invitations", null),
            new Call("GET", "/api/invitations/count", null),
            new Call("POST", "/api/invitations/" + UUID.randomUUID() + "/accept", null),
            new Call("GET", "/api/anything", null));

    private GroupFixtures groups;
    private UUID groupId;

    @BeforeEach
    void setUp() throws Exception {
        groups = new GroupFixtures(jdbc);
        SignedIn owner = registeredUser("Lastnica Skupine");
        groupId = groups.createGroup(groups.userId(owner.uid()), "Tuja skupina");
    }

    static Stream<Arguments> unverifiedCalls() {
        return CALLS.stream().flatMap(call -> Stream.of(Unverified.values()).map(kind -> Arguments.of(call, kind)));
    }

    @ParameterizedTest(name = "{0} z žetonom {1} → 403 EMAIL_NOT_VERIFIED, nič se ne spremeni")
    @MethodSource("unverifiedCalls")
    void unverifiedTokenIsRejectedBeforeAnyEffect(Call call, Unverified kind) throws Exception {
        SignedIn user = unverified(kind);
        Map<String, Object> groupBefore = groups.row(groupId);
        int groupCount = groups.groupCount();
        int profileCount = profileCount();

        HttpResponse<String> response = send(call, user.idToken());

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "EMAIL_NOT_VERIFIED"));
        assertThat(profileRows(user.uid()))
                .as("profil pred potrditvijo ne nastane")
                .isEmpty();
        assertThat(profileCount()).isEqualTo(profileCount);
        assertThat(groups.groupCount()).isEqualTo(groupCount);
        assertThat(groups.row(groupId)).isEqualTo(groupBefore);
    }

    @Test
    void unverifiedTokenOfExistingProfileIsRejectedAndProfileIsNotUpdated() throws Exception {
        // Obstoječ profil (npr. Google) z žetonom, ki je izgubil potrditev: ne posodobi se.
        SignedIn user = registeredUser("Obstoječa Uporabnica");
        List<Map<String, Object>> before = profileRows(user.uid());
        String token = Tokens.withClaims(user.idToken(), claims -> {
            claims.put("email_verified", false);
            claims.put("name", "Spremenjeno Ime");
        });

        HttpResponse<String> response = put("/api/me", token, "{\"language\":\"en\",\"theme\":\"dark\"}");

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(json(response.body())).containsEntry("code", "EMAIL_NOT_VERIFIED");
        assertThat(profileRows(user.uid())).isEqualTo(before);
    }

    @Test
    void invalidOrMissingTokenStays401EvenWhenUnverified() throws Exception {
        SignedIn user = emulator().signUpWithPassword(uniqueEmail(), GESLO);
        String expired = Tokens.withClaims(user.idToken(), claims -> {
            claims.put("iat", Tokens.epochSeconds(-7200));
            claims.put("auth_time", Tokens.epochSeconds(-7200));
            claims.put("exp", Tokens.epochSeconds(-3600));
        });

        for (String token : new String[] {null, "to.ni.zeton", expired, Tokens.withForgedSignature(user.idToken())}) {
            HttpResponse<String> response = put("/api/me", token, null);
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(json(response.body())).containsEntry("code", "UNAUTHENTICATED");
        }
        assertThat(profileRows(user.uid())).isEmpty();
    }

    @Test
    void healthStaysPublicForUnverifiedToken() throws Exception {
        SignedIn user = emulator().signUpWithPassword(uniqueEmail(), GESLO);

        assertThat(get("/api/health", user.idToken()).statusCode()).isEqualTo(200);
        assertThat(get("/api/health", null).statusCode()).isEqualTo(200);
    }

    @Test
    void davIsUnchangedAndDoesNotAcceptBearerTokens() throws Exception {
        SignedIn user = emulator().signUpWithPassword(uniqueEmail(), GESLO);

        HttpResponse<String> response = Http.send("PROPFIND", url("/dav/"), Http.bearer(user.idToken()));

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).doesNotContain("EMAIL_NOT_VERIFIED");
    }

    @Test
    void verifiedTokenPassesAsBefore() throws Exception {
        SignedIn google = newGoogleUser("Potrjena Uporabnica");

        assertThat(put("/api/me", google.idToken(), null).statusCode()).isEqualTo(201);
        assertThat(get("/api/groups", google.idToken()).statusCode()).isEqualTo(200);
        assertThat(get("/api/invitations", google.idToken()).statusCode()).isEqualTo(200);
    }

    @Test
    void afterVerificationNewTokenEntersAndProfileIsCreatedOnce() throws Exception {
        String email = uniqueEmail();
        SignedIn registered = emulator().signUpWithPassword(email, GESLO);
        assertThat(put("/api/me", registered.idToken(), null).statusCode()).isEqualTo(403);
        assertThat(profileRows(registered.uid())).isEmpty();

        emulator().verifyEmail(registered.idToken(), email);
        // Stari žeton nosi še email_verified=false: zavrnjen, dokler odjemalec ne osveži žetona (FR-017-13).
        assertThat(put("/api/me", registered.idToken(), null).statusCode()).isEqualTo(403);
        SignedIn verified = emulator().signInWithPassword(email, GESLO);
        assertThat(verified.uid()).isEqualTo(registered.uid());
        assertThat(Tokens.claims(verified.idToken())).containsEntry("email_verified", true);

        HttpResponse<String> created = put("/api/me", verified.idToken(), null);

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(json(created.body())).containsEntry("email", email);
        assertThat(profileRows(verified.uid())).hasSize(1);
        assertThat(get("/api/invitations", verified.idToken()).statusCode()).isEqualTo(200);
    }

    private SignedIn unverified(Unverified kind) throws Exception {
        return switch (kind) {
            case PASSWORD_SIGN_UP -> {
                SignedIn user = emulator().signUpWithPassword(uniqueEmail(), GESLO);
                assertThat(Tokens.claims(user.idToken())).containsEntry("email_verified", false);
                yield user;
            }
            case CLAIM_MISSING -> withClaim(claims -> claims.remove("email_verified"));
            case CLAIM_AS_STRING -> withClaim(claims -> claims.put("email_verified", "true"));
        };
    }

    private static SignedIn withClaim(Consumer<Map<String, Object>> change) throws Exception {
        SignedIn google = newGoogleUser("Nepotrjena Uporabnica");
        return new SignedIn(Tokens.withClaims(google.idToken(), change), google.uid());
    }

    private HttpResponse<String> send(Call call, String token) throws Exception {
        String path = call.path().replace("{g}", groupId.toString());
        return Http.send(call.method(), url(path), Http.bearer(token), call.body());
    }
}
