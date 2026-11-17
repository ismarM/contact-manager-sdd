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
 * Matrika izolacije slike kontakta (konstitucija III, §3.1; FR-018-09, 10): GET (VIEWER), PUT in DELETE (EDITOR) × akter
 * × stanje skupine, nato kontakt druge skupine, neobstoječ in izbrisan kontakt, zastarela verzija in zloraba datoteke.
 */
@Tag("FR-018-09")
@Tag("FR-018-10")
class ContactPhotoSecurityIT extends ImageApiTest {

    enum Actor {
        NO_TOKEN,
        MALFORMED_TOKEN,
        EXPIRED_TOKEN,
        NON_MEMBER,
        VIEWER,
        EDITOR,
        ADMIN,
        OWNER
    }

    enum Endpoint {
        GET,
        PUT,
        DELETE
    }

    enum State {
        ACTIVE,
        ARCHIVED,
        PERMANENTLY_ARCHIVED
    }

    record Expected(int status, String code) {}

    static Expected expected(Endpoint endpoint, Actor actor, State state) {
        return switch (actor) {
            case NO_TOKEN, MALFORMED_TOKEN, EXPIRED_TOKEN -> new Expected(401, "UNAUTHENTICATED");
            case NON_MEMBER -> new Expected(404, null);
            case OWNER -> state == State.PERMANENTLY_ARCHIVED ? new Expected(404, null) : allowed(endpoint, state);
            case VIEWER -> endpoint == Endpoint.GET ? new Expected(200, null) : new Expected(403, "FORBIDDEN");
            case EDITOR, ADMIN -> allowed(endpoint, state);
        };
    }

    private static Expected allowed(Endpoint endpoint, State state) {
        if (endpoint != Endpoint.GET && state != State.ACTIVE) {
            return new Expected(409, "GROUP_ARCHIVED");
        }
        return new Expected(200, null);
    }

    static Stream<Arguments> matrix() {
        List<Arguments> rows = new ArrayList<>();
        for (Endpoint endpoint : Endpoint.values()) {
            for (State state : State.values()) {
                for (Actor actor : Actor.values()) {
                    rows.add(Arguments.of(endpoint, actor, state));
                }
            }
        }
        return rows.stream();
    }

    private static Map<String, String> headers(Actor actor, Map<Who, SignedIn> users) {
        return switch (actor) {
            case NO_TOKEN -> Map.of();
            case MALFORMED_TOKEN -> Map.of("Authorization", "Bearer not-a-jwt");
            case EXPIRED_TOKEN ->
                Http.bearer(Tokens.withClaims(users.get(Who.OWNER).idToken(), claims -> {
                    claims.put("iat", Tokens.epochSeconds(-7200));
                    claims.put("auth_time", Tokens.epochSeconds(-7200));
                    claims.put("exp", Tokens.epochSeconds(-3600));
                }));
            default -> Http.bearer(users.get(Who.valueOf(actor.name())).idToken());
        };
    }

    private HttpResponse<String> send(
            Endpoint endpoint, String path, Map<String, String> headers, byte[] file, long version) throws Exception {
        return switch (endpoint) {
            case GET -> Http.send("GET", url(path), headers);
            case PUT ->
                multipart(
                        "PUT", path, headers, List.of(Part.file(file), Part.field("version", Long.toString(version))));
            case DELETE -> Http.send("DELETE", url(path + "?version=" + version), headers);
        };
    }

    /** Skupina s kontaktom, ki ima sliko; verzija kontakta je nato vrnjena na 0 (zahtevki matrike pošljejo 0). */
    private record Prepared(Scenario s, UUID contact) {}

    private Prepared prepared(State state) throws Exception {
        Scenario s = scenario();
        UUID contact = idOf(createViaApi(s, input("Janez", "Novak")));
        assertThat(upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), TestImages.jpeg(300, 300), 0L)
                        .statusCode())
                .isEqualTo(200);
        jdbc.update("update contact set version = 0 where id = ?", contact);
        switch (state) {
            case ARCHIVED -> groups.archive(s.group());
            case PERMANENTLY_ARCHIVED -> groups.makePermanentlyArchived(s.group());
            default -> {}
        }
        return new Prepared(s, contact);
    }

    @ParameterizedTest(name = "{0} {2}, {1}")
    @MethodSource("matrix")
    void isolationMatrix(Endpoint endpoint, Actor actor, State state) throws Exception {
        Prepared p = prepared(state);
        Scenario s = p.s();
        Map<String, Object> contactBefore = contacts.row(p.contact());
        Long revisionBefore = revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact());
        int entriesBefore = auditEntries(s.group()).size();
        Expected expected = expected(endpoint, actor, state);

        HttpResponse<String> response = send(
                endpoint,
                contactPhotoPath(s.group(), p.contact()),
                headers(actor, s.users()),
                TestImages.jpeg(300, 300),
                0);

        assertThat(response.statusCode()).as("status").isEqualTo(expected.status());
        if (expected.status() == 404) {
            assertThat(response.body()).as("nečlan ne izve ničesar").isEmpty();
        }
        if (expected.code() != null) {
            assertThat(json(response.body())).containsEntry("code", expected.code());
        }
        if (endpoint == Endpoint.GET && expected.status() != 200) {
            assertThat(response.headers().firstValue("Content-Type").orElse("")).doesNotContain("image/");
        }
        if (expected.status() != 200 || endpoint == Endpoint.GET) {
            assertThat(contacts.row(p.contact())).as("kontakt je nespremenjen").isEqualTo(contactBefore);
            assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact()))
                    .isEqualTo(revisionBefore);
            assertThat(auditEntries(s.group())).hasSize(entriesBefore);
        } else if (endpoint == Endpoint.PUT) {
            assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact()))
                    .isEqualTo(revisionBefore + 1);
            assertThat(contacts.version(p.contact())).isEqualTo(1);
            assertThat(auditEntries(s.group())).hasSize(entriesBefore + 1);
        } else {
            assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact()))
                    .isNull();
            assertThat(auditEntries(s.group())).hasSize(entriesBefore + 1);
        }
    }

    // --- kontakt druge skupine, neobstoječ in izbrisan ---

    @Test
    void contactOfAnotherGroupThroughMyGroupPathIsNotFoundForEveryEndpointAndRole() throws Exception {
        Scenario mine = scenario();
        Scenario other = scenario();
        UUID foreign = idOf(createViaApi(other, input("Tuj", "Kontakt")));
        upload(contactPhotoPath(other.group(), foreign), other.token(Who.EDITOR), TestImages.jpeg(300, 300), 0L);

        for (Who who : List.of(Who.OWNER, Who.ADMIN, Who.EDITOR, Who.VIEWER)) {
            for (Endpoint endpoint : Endpoint.values()) {
                HttpResponse<String> response = send(
                        endpoint,
                        contactPhotoPath(mine.group(), foreign),
                        Http.bearer(mine.token(who)),
                        TestImages.jpeg(100, 100),
                        1);
                assertThat(response.statusCode()).as(who + " " + endpoint).isEqualTo(404);
            }
        }
        // slika tujega kontakta je nespremenjena in dostopna prek njegove skupine
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", foreign)).isEqualTo(1L);
        assertThat(contacts.version(foreign)).isEqualTo(1);
        // član druge skupine za pot skupine, kjer ni član
        assertThat(send(
                                Endpoint.GET,
                                contactPhotoPath(other.group(), foreign),
                                Http.bearer(mine.token(Who.OWNER)),
                                null,
                                0)
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    void unknownMalformedAndDeletedContactsAreNotFound() throws Exception {
        Scenario s = scenario();
        UUID deleted = idOf(createViaApi(s, input("Izbrisan", "Kontakt")));
        upload(contactPhotoPath(s.group(), deleted), s.token(Who.EDITOR), TestImages.jpeg(300, 300), 0L);
        delete(contactPath(s.group(), deleted) + "?version=1", s.token(Who.EDITOR));
        Map<String, String> bearer = Http.bearer(s.token(Who.OWNER));

        for (String contact : List.of(UUID.randomUUID().toString(), "not-a-uuid", deleted.toString())) {
            for (Endpoint endpoint : Endpoint.values()) {
                HttpResponse<String> response = send(
                        endpoint, contactPath(s.group(), contact) + "/photo", bearer, TestImages.jpeg(100, 100), 0);
                assertThat(response.statusCode()).as(contact + " " + endpoint).isEqualTo(404);
            }
        }
    }

    @Test
    void unauthenticatedRequestForAKnownAddressNeverReturnsTheImage() throws Exception {
        Prepared p = prepared(State.ACTIVE);

        HttpResponse<byte[]> response = download(contactPhotoPath(p.s().group(), p.contact()), null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).doesNotContain("image/");
    }

    // --- verzija in zloraba datoteke ---

    @Test
    void staleVersionIsAConflictAndChangesNothing() throws Exception {
        Prepared p = prepared(State.ACTIVE);
        Scenario s = p.s();
        contacts.editedByOther(p.contact(), s.id(Who.ADMIN), "031 000 000"); // verzija 1
        int entries = auditEntries(s.group()).size();

        for (Endpoint endpoint : List.of(Endpoint.PUT, Endpoint.DELETE)) {
            HttpResponse<String> response = send(
                    endpoint,
                    contactPhotoPath(s.group(), p.contact()),
                    Http.bearer(s.token(Who.EDITOR)),
                    TestImages.jpeg(300, 300),
                    0);
            assertThat(response.statusCode()).as(endpoint.name()).isEqualTo(409);
            assertThat(json(response.body())).containsEntry("code", "VERSION_CONFLICT");
        }
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact()))
                .isEqualTo(1L);
        assertThat(auditEntries(s.group())).hasSize(entries);
    }

    @Test
    void invalidFileIsOnlyReportedAfterAccessAndArchiveChecks() throws Exception {
        Prepared p = prepared(State.ACTIVE);
        Scenario s = p.s();
        String path = contactPhotoPath(s.group(), p.contact());
        byte[] junk = "not an image".getBytes();

        assertThat(send(Endpoint.PUT, path, Map.of(), junk, 0).statusCode()).isEqualTo(401);
        HttpResponse<String> nonMember = send(Endpoint.PUT, path, Http.bearer(s.token(Who.NON_MEMBER)), junk, 0);
        assertThat(nonMember.statusCode()).isEqualTo(404);
        assertThat(nonMember.body()).isEmpty();
        HttpResponse<String> viewer = send(Endpoint.PUT, path, Http.bearer(s.token(Who.VIEWER)), junk, 0);
        assertThat(viewer.statusCode()).isEqualTo(403);
        assertThat(json(viewer.body())).containsEntry("code", "FORBIDDEN");
        HttpResponse<String> invalid = send(Endpoint.PUT, path, Http.bearer(s.token(Who.EDITOR)), junk, 0);
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(invalid.body())).containsEntry("file", "INVALID_IMAGE");

        groups.archive(s.group());
        HttpResponse<String> archived = send(Endpoint.PUT, path, Http.bearer(s.token(Who.EDITOR)), junk, 0);
        assertThat(archived.statusCode()).isEqualTo(409);
        assertThat(json(archived.body())).containsEntry("code", "GROUP_ARCHIVED");
        HttpResponse<String> archivedViewer = send(Endpoint.PUT, path, Http.bearer(s.token(Who.VIEWER)), junk, 0);
        assertThat(archivedViewer.statusCode()).isEqualTo(403);
    }

    @Test
    void abuseOfTheFilePartIsRejectedWithoutAnyChange() throws Exception {
        Prepared p = prepared(State.ACTIVE);
        Scenario s = p.s();
        String path = contactPhotoPath(s.group(), p.contact());
        String token = s.token(Who.EDITOR);
        Long revision = revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact());
        byte[] valid = TestImages.jpeg(100, 100);
        Part version = Part.field("version", "0");

        HttpResponse<String> fake = multipart(
                "PUT",
                path,
                token,
                List.of(
                        Part.file("slika.png", "image/png", "<svg xmlns='http://www.w3.org/2000/svg'/>".getBytes()),
                        version));
        HttpResponse<String> exe = multipart(
                "PUT",
                path,
                token,
                List.of(Part.file("slika.jpg", "image/jpeg", "MZ\u0090\u0000\u0003".getBytes()), version));
        HttpResponse<String> huge = multipart(
                "PUT", path, token, List.of(Part.file("slika.jpg", "image/jpeg", new byte[6 * 1024 * 1024]), version));
        HttpResponse<String> missing = multipart("PUT", path, token, List.of(version));
        HttpResponse<String> wrongName =
                multipart("PUT", path, token, List.of(new Part("photo", "slika.jpg", "image/jpeg", valid), version));
        HttpResponse<String> two = multipart("PUT", path, token, List.of(Part.file(valid), Part.file(valid), version));
        HttpResponse<String> empty =
                multipart("PUT", path, token, List.of(Part.file("slika.jpg", "image/jpeg", new byte[0]), version));

        assertThat(fake.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(fake.body())).containsEntry("file", "INVALID_IMAGE");
        assertThat(exe.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(exe.body())).containsEntry("file", "INVALID_IMAGE");
        assertThat(huge.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(huge.body())).containsEntry("file", "FILE_TOO_LARGE");
        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(missing.body())).containsEntry("file", "REQUIRED");
        assertThat(wrongName.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(wrongName.body())).containsEntry("file", "REQUIRED");
        assertThat(two.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(two.body())).containsKey("file");
        assertThat(empty.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(empty.body())).containsEntry("file", "REQUIRED");
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", p.contact()))
                .isEqualTo(revision);
        assertThat(contacts.version(p.contact())).isZero();
    }
}
