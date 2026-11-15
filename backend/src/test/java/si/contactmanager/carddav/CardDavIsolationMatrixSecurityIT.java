package si.contactmanager.carddav;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/**
 * Matrika izolacije CardDAV (konstitucija III, §3.1; FR-014-22, -24, -25, -26; SC-007): brez ali z napačnim, preklicanim
 * geslom ali geslom izbrisanega računa 401; Firebase JWT na {@code /dav} in Basic na {@code /api} 401; tuja,
 * neobstoječa ali zapuščena skupina in tuj kontakt 404; pisanje 403 pri vseh vlogah brez spremembe; branje 207 za vse
 * člane tudi v arhivirani skupini; zaklep po 10 neuspehih.
 */
@Tag("FR-014-22")
@Tag("FR-014-24")
@Tag("FR-014-26")
@Tag("SC-007")
class CardDavIsolationMatrixSecurityIT extends DavApiTest {

    static Stream<Arguments> members() {
        return Stream.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)
                .flatMap(who -> Stream.of(Arguments.of(who, false), Arguments.of(who, true)));
    }

    @ParameterizedTest(name = "{0}, arhivirana {1}")
    @MethodSource("members")
    void membersReadAndEveryWriteIsForbidden(Who who, boolean archived) throws Exception {
        Scenario s = scenario();
        String id = (String) createViaApi(s, input("Ana", "Kos")).get("id");
        if (archived) {
            groups.archive(s.group());
        }
        Credentials credentials = appPassword(s.users().get(who));
        Map<String, Object> before = contacts.row(UUID.fromString(id));
        String vcard = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Vsiljen\r\nEND:VCARD\r\n";

        assertThat(propfind(book(s.group()), credentials, "1").statusCode()).isEqualTo(207);
        assertThat(dav("GET", card(s.group(), id), credentials, null, Map.of()).statusCode())
                .isEqualTo(200);
        assertThat(dav("HEAD", card(s.group(), id), credentials, null, Map.of()).statusCode())
                .isEqualTo(200);
        HttpResponse<String> multiget = report(book(s.group()), credentials, multiget(s.group(), id));
        HttpResponse<String> sync = report(book(s.group()), credentials, syncCollection(""));
        assertThat(multiget.statusCode()).isEqualTo(207);
        assertThat(multiget.body()).contains("FN:Ana Kos");
        assertThat(sync.statusCode()).isEqualTo(207);
        assertThat(sync.body()).contains(card(s.group(), id));
        for (String[] write : new String[][] {
            {"PUT", card(s.group(), id)},
            {"PUT", card(s.group(), UUID.randomUUID())},
            {"DELETE", card(s.group(), id)},
            {"DELETE", book(s.group())},
            {"PROPPATCH", book(s.group())},
            {"MKCOL", "/dav/addressbooks/" + UUID.randomUUID() + "/"},
            {"MOVE", card(s.group(), id)},
            {"COPY", card(s.group(), id)},
            {"LOCK", card(s.group(), id)},
            {"POST", book(s.group())}
        }) {
            HttpResponse<String> response = dav(write[0], write[1], credentials, vcard, Map.of());
            assertThat(response.statusCode()).as(write[0] + " " + write[1]).isEqualTo(403);
        }
        assertThat(contacts.row(UUID.fromString(id))).isEqualTo(before);
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    static String multiget(Object group, Object contact) {
        return "<?xml version=\"1.0\"?><card:addressbook-multiget xmlns:d=\"DAV:\""
                + " xmlns:card=\"urn:ietf:params:xml:ns:carddav\"><d:prop><d:getetag/><card:address-data/></d:prop>"
                + "<d:href>" + card(group, contact) + "</d:href></card:addressbook-multiget>";
    }

    static Stream<Who> everyone() {
        return Stream.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER, Who.NON_MEMBER);
    }

    /** Vsaka metoda (branje, REPORT, pisanje) na skupino, katere akter ni član, je 404 brez podatkov. */
    @ParameterizedTest(name = "{0}")
    @MethodSource("everyone")
    void everyMethodOnAGroupTheActorIsNotAMemberOfIsNotFound(Who who) throws Exception {
        Scenario s = scenario();
        long stranger = groups.userId(registeredUser("Tujec").uid());
        UUID foreign = groups.createGroup(stranger, "Tuja");
        UUID contact = contacts.insert(foreign, stranger, "Tuj", "Kontakt");
        Credentials credentials = appPassword(s.users().get(who));
        Map<String, Object> before = contacts.row(contact);

        for (String[] call : new String[][] {
            {"PROPFIND", book(foreign), PROPFIND_ALL},
            {"REPORT", book(foreign), multiget(foreign, contact)},
            {"REPORT", book(foreign), syncCollection("")},
            {"GET", card(foreign, contact), null},
            {"HEAD", card(foreign, contact), null},
            {"PUT", card(foreign, contact), "BEGIN:VCARD\r\nEND:VCARD\r\n"},
            {"PUT", card(foreign, UUID.randomUUID()), "BEGIN:VCARD\r\nEND:VCARD\r\n"},
            {"DELETE", card(foreign, contact), null},
            {"PROPPATCH", book(foreign), PROPFIND_ALL}
        }) {
            HttpResponse<String> response = dav(call[0], call[1], credentials, call[2], Map.of("Depth", "1"));
            assertThat(response.statusCode()).as(call[0] + " " + call[1]).isEqualTo(404);
            assertThat(response.body()).doesNotContain("Tuj");
        }
        assertThat(contacts.row(contact)).isEqualTo(before);
    }

    /** Trajno arhivirana skupina (012) nima lastnika: nekdanji lastnik je nečlan (404), ostali člani berejo. */
    @Test
    void aPermanentlyArchivedGroupIsNotFoundForTheFormerOwnerAndReadableForMembers() throws Exception {
        Scenario s = scenario();
        String id = (String) createViaApi(s, input("Ana", "Kos")).get("id");
        Credentials owner = appPassword(s.users().get(Who.OWNER));
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));
        groups.makePermanentlyArchived(s.group());

        assertThat(propfind(book(s.group()), owner, "1").statusCode()).isEqualTo(404);
        assertThat(report(book(s.group()), owner, syncCollection("")).statusCode())
                .isEqualTo(404);
        assertThat(dav("GET", card(s.group(), id), owner, null, Map.of()).statusCode())
                .isEqualTo(404);
        assertThat(propfind(book(s.group()), viewer, "1").statusCode()).isEqualTo(207);
        assertThat(report(book(s.group()), viewer, multiget(s.group(), id)).statusCode())
                .isEqualTo(207);
        assertThat(dav("PUT", card(s.group(), id), viewer, "x", Map.of()).statusCode())
                .isEqualTo(403);
    }

    @Test
    void foreignMissingAndLeftGroupsAndForeignContactsAreNotFound() throws Exception {
        Scenario s = scenario();
        UUID foreign = groups.createGroup(s.id(Who.OWNER), "Klub");
        UUID foreignContact = contacts.insert(foreign, s.id(Who.OWNER), "Tuj", "Kontakt");
        UUID mine = contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");
        Credentials viewer = appPassword(s.users().get(Who.VIEWER));
        Credentials outsider = appPassword(s.users().get(Who.NON_MEMBER));

        assertThat(propfind(book(foreign), viewer, "0").statusCode()).isEqualTo(404);
        assertThat(propfind(book(UUID.randomUUID()), viewer, "0").statusCode()).isEqualTo(404);
        assertThat(propfind("/dav/addressbooks/ni-uuid/", viewer, "0").statusCode())
                .isEqualTo(404);
        assertThat(dav("GET", card(s.group(), foreignContact), viewer, null, Map.of())
                        .statusCode())
                .isEqualTo(404);
        assertThat(dav("GET", card(foreign, foreignContact), viewer, null, Map.of())
                        .statusCode())
                .isEqualTo(404);
        assertThat(dav("PUT", card(foreign, foreignContact), viewer, "x", Map.of())
                        .statusCode())
                .isEqualTo(404);
        assertThat(propfind(book(s.group()), outsider, "1").statusCode()).isEqualTo(404);
        assertThat(propfind("/dav/addressbooks/", outsider, "1").body())
                .doesNotContain(s.group().toString());

        jdbc.update("delete from group_member where group_id = ? and user_id = ?", s.group(), s.id(Who.VIEWER));

        assertThat(propfind(book(s.group()), viewer, "0").statusCode()).isEqualTo(404);
        assertThat(dav("GET", card(s.group(), mine), viewer, null, Map.of()).statusCode())
                .isEqualTo(404);
        assertThat(propfind("/dav/addressbooks/", viewer, "1").body())
                .doesNotContain(s.group().toString());
    }

    @Test
    void onlyAValidAppPasswordAuthenticates() throws Exception {
        Scenario s = scenario();
        SignedIn owner = s.users().get(Who.OWNER);
        Credentials valid = appPassword(owner);
        Credentials other = appPassword(owner);
        String otherId = jdbc.queryForObject(
                "select id::text from app_password where user_id = ? order by created_at desc, id desc limit 1",
                String.class,
                s.id(Who.OWNER));

        assertThat(dav("PROPFIND", "/dav/", null, PROPFIND_ALL, Map.of("Depth", "0"))
                        .statusCode())
                .isEqualTo(401);
        HttpResponse<String> wrong = propfind("/dav/", new Credentials(valid.email(), "napacno-geslo"), "0");
        assertThat(wrong.statusCode()).isEqualTo(401);
        assertThat(wrong.headers().firstValue("WWW-Authenticate"))
                .hasValueSatisfying(h -> assertThat(h).startsWith("Basic"));
        assertThat(propfind("/dav/", new Credentials("nihce@primer.si", valid.password()), "0")
                        .statusCode())
                .isEqualTo(401);
        assertThat(propfind(
                                "/dav/",
                                new Credentials(
                                        valid.email().toUpperCase(),
                                        valid.password().toUpperCase()),
                                "0")
                        .statusCode())
                .isEqualTo(207);
        assertThat(dav(
                                "PROPFIND",
                                "/dav/",
                                null,
                                PROPFIND_ALL,
                                Map.of("Depth", "0", "Authorization", "Bearer " + owner.idToken()))
                        .statusCode())
                .isEqualTo(401);
        assertThat(Http.send("GET", url("/api/groups"), Map.of("Authorization", basic(valid.email(), valid.password())))
                        .statusCode())
                .isEqualTo(401);

        assertThat(Http.send("DELETE", url("/api/me/app-passwords/" + otherId), Http.bearer(owner.idToken()))
                        .statusCode())
                .isEqualTo(204);

        assertThat(propfind("/dav/", other, "0").statusCode()).isEqualTo(401);
        assertThat(propfind("/dav/", valid, "0").statusCode()).isEqualTo(207);
    }

    @Test
    void theAccountIsLockedAfterTenFailuresWithoutAffectingWebSignIn() throws Exception {
        Scenario s = scenario();
        Credentials valid = appPassword(s.users().get(Who.EDITOR));
        Credentials wrong = new Credentials(valid.email(), "napacno");

        for (int i = 0; i < 10; i++) {
            assertThat(propfind("/dav/", wrong, "0").statusCode()).isEqualTo(401);
        }

        assertThat(propfind("/dav/", valid, "0").statusCode()).isEqualTo(401);
        assertThat(get("/api/groups", s.token(Who.EDITOR)).statusCode()).isEqualTo(200);

        jdbc.update(
                "update dav_login_state set locked_until = now() - interval '1 second' where user_id = ?",
                s.id(Who.EDITOR));

        assertThat(propfind("/dav/", valid, "0").statusCode()).isEqualTo(207);
        assertThat(jdbc.queryForObject(
                        "select count(*) from dav_login_state where user_id = ?", Integer.class, s.id(Who.EDITOR)))
                .isZero();
        assertThat(jdbc.queryForObject(
                        "select last_used_at is not null from app_password where user_id = ?",
                        Boolean.class,
                        s.id(Who.EDITOR)))
                .isTrue();
    }

    @Test
    void aDeletedAccountsPasswordNoLongerWorks() throws Exception {
        Scenario s = scenario();
        Credentials outsider = appPassword(s.users().get(Who.NON_MEMBER));

        HttpResponse<String> deleted = post(
                "/api/me/deletion",
                s.token(Who.NON_MEMBER),
                "{\"email\":\"" + groups.email(s.users().get(Who.NON_MEMBER).uid()) + "\"}");

        assertThat(deleted.statusCode()).isIn(202, 204);
        assertThat(propfind("/dav/", outsider, "0").statusCode()).isEqualTo(401);
    }
}
