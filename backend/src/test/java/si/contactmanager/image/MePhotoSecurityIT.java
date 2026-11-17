package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.Tokens;

/**
 * Matrika izolacije za profilno sliko (konstitucija III, §3.1; FR-018-01, 02, 03): uporabniške poti {@code /api/me/photo}
 * (401 brez veljavnega žetona; poti delujejo samo nad lastno sliko) in {@code GET …/members/{memberId}/photo}
 * (401 / 404 nečlan / 404 član druge skupine / 200 VIEWER+ / 200 arhivirana).
 */
@Tag("FR-018-01")
@Tag("FR-018-02")
@Tag("FR-018-03")
class MePhotoSecurityIT extends ImageApiTest {

    enum Endpoint {
        GET_ME,
        PUT_ME,
        DELETE_ME,
        GOOGLE_ME,
        GET_MEMBER
    }

    enum Token {
        NONE,
        MALFORMED,
        EXPIRED,
        FORGED_SIGNATURE
    }

    static Stream<Arguments> unauthenticated() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (Token token : Token.values()) {
                rows.add(Arguments.of(endpoint, token));
            }
        }
        return rows.stream();
    }

    private static Map<String, String> headers(Token token, String valid) {
        return switch (token) {
            case NONE -> Map.of();
            case MALFORMED -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED ->
                Http.bearer(Tokens.withClaims(valid, claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            case FORGED_SIGNATURE -> Http.bearer(Tokens.withForgedSignature(valid));
        };
    }

    private HttpResponse<String> send(Endpoint endpoint, Map<String, String> headers, String memberPath)
            throws Exception {
        return switch (endpoint) {
            case GET_ME -> Http.send("GET", url("/api/me/photo"), headers);
            case PUT_ME -> multipart("PUT", "/api/me/photo", headers, List.of(Part.file(TestImages.jpeg(200, 200))));
            case DELETE_ME -> Http.send("DELETE", url("/api/me/photo"), headers);
            case GOOGLE_ME -> Http.send("POST", url("/api/me/photo/google"), headers);
            case GET_MEMBER -> Http.send("GET", url(memberPath), headers);
        };
    }

    @ParameterizedTest(name = "{0} brez veljavnega žetona ({1})")
    @MethodSource("unauthenticated")
    void unauthenticatedRequestsAreRejectedAndChangeNothing(Endpoint endpoint, Token token) throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));
        UUID member = jdbc.queryForObject(
                "select id from group_member where group_id = ? and user_id = ?",
                UUID.class,
                s.group(),
                s.id(Who.EDITOR));
        long photos = imageCount("true");
        Long revision = revisionOf("kind = 'USER' and user_id = ?", s.id(Who.EDITOR));

        HttpResponse<String> response = send(
                endpoint,
                headers(token, s.token(Who.OWNER)),
                "/api/groups/" + s.group() + "/members/" + member + "/photo");

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(json(response.body())).containsEntry("code", "UNAUTHENTICATED");
        assertThat(imageCount("true")).isEqualTo(photos);
        assertThat(revisionOf("kind = 'USER' and user_id = ?", s.id(Who.EDITOR)))
                .isEqualTo(revision);
    }

    @Test
    void otherUserNeverSeesChangesOrRemovesSomeoneElsesPhoto() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        long anaId = groups.userId(ana.uid());
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));
        byte[] anaPhoto = download("/api/me/photo", ana.idToken()).body();

        // Bojan nima slike: pot je vedno nad lastno sliko, zato je odgovor 404, ne Anina slika.
        assertThat(download("/api/me/photo", bojan.idToken()).statusCode()).isEqualTo(404);
        assertThat(Http.send("DELETE", url("/api/me/photo"), Http.bearer(bojan.idToken()))
                        .statusCode())
                .isEqualTo(204);
        assertThat(uploadMe(bojan.idToken(), TestImages.jpeg(310, 310)).statusCode())
                .isEqualTo(200);

        // Anina slika je nespremenjena; Bojan ima svojo.
        assertThat(download("/api/me/photo", ana.idToken()).body()).isEqualTo(anaPhoto);
        assertThat(revisionOf("kind = 'USER' and user_id = ?", anaId)).isEqualTo(1L);
        assertThat(imageCount("kind = 'USER' and user_id = ?", groups.userId(bojan.uid())))
                .isEqualTo(1);
    }

    @Test
    void userIdentifierInTheRequestIsNotAnInputAtAll() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        // Poizvedbeni parametri in dodatna polja obrazca ne spremenijo lastnika slike.
        HttpResponse<String> response = multipart(
                "PUT",
                "/api/me/photo?userId=" + groups.userId(ana.uid()),
                bojan.idToken(),
                List.of(Part.file(TestImages.jpeg(300, 300)), Part.field("userId", "" + groups.userId(ana.uid()))));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(revisionOf("kind = 'USER' and user_id = ?", groups.userId(ana.uid())))
                .isEqualTo(1L);
        assertThat(revisionOf("kind = 'USER' and user_id = ?", groups.userId(bojan.uid())))
                .isEqualTo(1L);
    }

    // --- GET …/members/{memberId}/photo ---

    enum Actor {
        NON_MEMBER,
        VIEWER,
        EDITOR,
        ADMIN,
        OWNER
    }

    static Stream<Arguments> memberMatrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Actor actor : Actor.values()) {
            for (boolean archived : new boolean[] {false, true}) {
                rows.add(Arguments.of(actor, archived));
            }
        }
        return rows.stream();
    }

    @ParameterizedTest(name = "član: {0}, arhivirana: {1}")
    @MethodSource("memberMatrix")
    void memberPhotoMatrix(Actor actor, boolean archived) throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));
        UUID member = jdbc.queryForObject(
                "select id from group_member where group_id = ? and user_id = ?",
                UUID.class,
                s.group(),
                s.id(Who.EDITOR));
        if (archived) {
            groups.archive(s.group());
        }
        String token = s.token(Who.valueOf(actor.name()));

        HttpResponse<byte[]> response = download("/api/groups/" + s.group() + "/members/" + member + "/photo", token);

        assertThat(response.statusCode()).isEqualTo(actor == Actor.NON_MEMBER ? 404 : 200);
        if (actor == Actor.NON_MEMBER) {
            assertThat(response.body()).isEmpty();
        }
    }

    @Test
    void memberOfAnotherGroupIsNotFoundForAMemberOfThisGroup() throws Exception {
        Scenario s = scenario();
        Scenario other = scenario();
        uploadMe(other.token(Who.EDITOR), TestImages.jpeg(300, 300));
        UUID foreign = jdbc.queryForObject(
                "select id from group_member where group_id = ? and user_id = ?",
                UUID.class,
                other.group(),
                other.id(Who.EDITOR));

        for (Who who : List.of(Who.OWNER, Who.ADMIN, Who.EDITOR, Who.VIEWER)) {
            assertThat(download("/api/groups/" + s.group() + "/members/" + foreign + "/photo", s.token(who))
                            .statusCode())
                    .as(who.name())
                    .isEqualTo(404);
        }
    }
}
