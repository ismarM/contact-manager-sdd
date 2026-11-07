package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.ContactApiTest;

/** Kontakti v arhivirani skupini (FR-004-15; feature-map §2.2 korak 3 pred 4, §2.4). */
@Tag("FR-004-15")
class ContactArchivedRuleIT extends ContactApiTest {

    private void assertWritesRejected(Scenario s, UUID contact, Who who, int status, String code) throws Exception {
        String name = who.name();
        Map<String, Object> values = withVersion(input("Prepisan", "Kontakt"), 0);
        HttpResponse<String> create = post(contactsPath(s.group()), s.token(who), body(input("Nov", "Kontakt")));
        HttpResponse<String> update = put(contactPath(s.group(), contact), s.token(who), body(values));
        HttpResponse<String> remove = delete(contactPath(s.group(), contact) + "?version=0", s.token(who));

        for (HttpResponse<String> response : List.of(create, update, remove)) {
            assertThat(response.statusCode()).as(name).isEqualTo(status);
            assertThat(json(response.body())).as(name).containsEntry("code", code);
        }
    }

    @Test
    void editorAdminAndOwnerGetGroupArchivedAndNothingChanges() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        Map<String, Object> rowBefore = contacts.row(contact);
        groups.archive(s.group());

        for (Who who : List.of(Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            assertWritesRejected(s, contact, who, 409, "GROUP_ARCHIVED");
        }

        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(contacts.row(contact)).isEqualTo(rowBefore);
    }

    @Test
    void viewerGetsForbiddenBeforeArchivedness() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        groups.archive(s.group());

        assertWritesRejected(s, contact, Who.VIEWER, 403, "FORBIDDEN");

        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    void everyMemberStillReadsListAndContact() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        groups.archive(s.group());

        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            assertThat(get(contactsPath(s.group()), s.token(who)).statusCode())
                    .as(who.name())
                    .isEqualTo(200);
            assertThat(get(contactPath(s.group(), contact), s.token(who)).statusCode())
                    .as(who.name())
                    .isEqualTo(200);
        }
    }

    @Test
    void afterUnarchivingWritingWorksAgain() throws Exception {
        Scenario s = scenario();
        groups.archive(s.group());
        assertThat(post(contactsPath(s.group()), s.token(Who.EDITOR), body(input("A", "B")))
                        .statusCode())
                .isEqualTo(409);

        assertThat(post("/api/groups/" + s.group() + "/unarchive", s.token(Who.OWNER), null)
                        .statusCode())
                .isEqualTo(200);

        assertThat(post(contactsPath(s.group()), s.token(Who.EDITOR), body(input("A", "B")))
                        .statusCode())
                .isEqualTo(201);
    }

    @Test
    void groupArchivedComesBeforeVersionConflictAndValidation() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        contacts.editedByOther(contact, s.id(Who.ADMIN), "031 999 888"); // trenutna verzija je 1
        groups.archive(s.group());
        Map<String, Object> rowBefore = contacts.row(contact);
        String path = contactPath(s.group(), contact);

        // feature-map §2.2: korak 4 (GROUP_ARCHIVED) pred 5 (VERSION_CONFLICT) in 6 (VALIDATION_FAILED).
        List<HttpResponse<String>> responses = List.of(
                put(path, s.token(Who.EDITOR), body(withVersion(input("Prepisan", "Kontakt"), 0))),
                put(path, s.token(Who.EDITOR), body(withVersion(Map.of("email", "janez@"), 1))),
                put(path, s.token(Who.EDITOR), "{broken"),
                post(contactsPath(s.group()), s.token(Who.EDITOR), body(Map.of("email", "janez@"))),
                delete(path + "?version=0", s.token(Who.EDITOR)),
                delete(path, s.token(Who.EDITOR)),
                delete(path + "?version=abc", s.token(Who.EDITOR)));

        for (HttpResponse<String> response : responses) {
            assertThat(response.statusCode()).isEqualTo(409);
            assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        }
        assertThat(contacts.row(contact)).isEqualTo(rowBefore);
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }

    @Test
    @Tag("FR-004-13")
    @Tag("FR-004-14")
    void missingOrForeignContactInAnArchivedGroupIsNotFoundForEveryRole() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        for (Who who : List.of(Who.ADMIN, Who.EDITOR, Who.VIEWER)) {
            groups.addMember(other, s.id(who), who.name());
        }
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        Map<String, Object> foreignBefore = contacts.row(foreign);
        groups.archive(s.group());

        // feature-map §2.2: vir, ki ga v tej skupini ni, je 404 (korak 2) pred 403 in GROUP_ARCHIVED.
        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            for (UUID target : List.of(UUID.randomUUID(), foreign)) {
                String path = contactPath(s.group(), target);
                HttpResponse<String> update =
                        put(path, s.token(who), body(withVersion(input("Prepisan", "Kontakt"), 0)));
                HttpResponse<String> remove = delete(path + "?version=0", s.token(who));
                HttpResponse<String> removeWithoutVersion = delete(path, s.token(who));
                for (HttpResponse<String> response : List.of(update, remove, removeWithoutVersion)) {
                    assertThat(response.statusCode()).as(who.name()).isEqualTo(404);
                    assertThat(response.body()).as(who.name()).isEmpty();
                }
            }
        }
        assertThat(contacts.row(foreign)).isEqualTo(foreignBefore);
    }

    @Test
    void permanentlyArchivedGroupRejectsEditorsAndAdminsAndForbidsViewers() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        groups.makePermanentlyArchived(s.group());

        assertWritesRejected(s, contact, Who.EDITOR, 409, "GROUP_ARCHIVED");
        assertWritesRejected(s, contact, Who.ADMIN, 409, "GROUP_ARCHIVED");
        assertWritesRejected(s, contact, Who.VIEWER, 403, "FORBIDDEN");
        assertThat(get(contactPath(s.group(), contact), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(200);
        assertThat(contacts.count(s.group())).isEqualTo(1);
    }
}
