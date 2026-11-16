package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;

/**
 * Slika kontakta v revizijski sledi (FR-018-10, FR-018-17): vnos in zgodovina vsebujeta {@code photoChange}, obnova stare
 * različice obstoječega kontakta in rollback sliko pustita pri miru; vnos brez razlik polj je »ni sprememb«.
 */
@Tag("FR-018-10")
@Tag("FR-018-17")
class ContactPhotoAuditIT extends ImageApiTest {

    private UUID create(Scenario s, String first, String last, String phone) throws Exception {
        Map<String, Object> input = input(first, last);
        input.put("phone", phone);
        return idOf(createViaApi(s, input));
    }

    private HttpResponse<String> addPhoto(Scenario s, UUID contact, long version) throws Exception {
        HttpResponse<String> response =
                upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), TestImages.jpeg(300, 300), version);
        assertThat(response.statusCode()).isEqualTo(200);
        return response;
    }

    private long editPhone(Scenario s, UUID contact, String phone, long version) throws Exception {
        Map<String, Object> values = new LinkedHashMap<>(input("Janez", "Novak"));
        values.put("phone", phone);
        HttpResponse<String> response =
                put(contactPath(s.group(), contact), s.token(Who.EDITOR), body(withVersion(values, version)));
        assertThat(response.statusCode()).isEqualTo(200);
        return ((Number) json(response.body()).get("version")).longValue();
    }

    private List<UUID> entryIds(Scenario s) {
        return auditEntries(s.group()).stream().map(e -> (UUID) e.get("id")).toList();
    }

    private UUID latestEntry(Scenario s) {
        return jdbc.queryForObject("select last_entry_id from audit_head where group_id = ?", UUID.class, s.group());
    }

    private String phoneOf(UUID contact) {
        return jdbc.queryForObject("select phone from contact where id = ?", String.class, contact);
    }

    @Test
    void auditListEntryAndContactHistoryCarryThePhotoChangeWithoutFieldDifferences() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        addPhoto(s, contact, 1);
        UUID added = entryIds(s).get(1);

        List<Map<String, Object>> items = asObjects(json(get("/api/groups/" + s.group() + "/audit", s.token(Who.VIEWER))
                        .body())
                .get("items"));
        Map<String, Object> single = json(get("/api/groups/" + s.group() + "/audit/" + added, s.token(Who.VIEWER))
                .body());
        Map<String, Object> history = json(get(contactPath(s.group(), contact) + "/history", s.token(Who.VIEWER))
                .body());
        List<Map<String, Object>> events = asObjects(history.get("items"));

        // najnovejši prvi: REPLACED, ADDED, CREATE
        assertThat(items.stream().map(i -> i.get("photoChange")).toList()).containsExactly("REPLACED", "ADDED", null);
        assertThat(items.get(0)).containsEntry("action", "UPDATE").containsEntry("contactName", "Janez Novak");
        assertThat(single).containsEntry("photoChange", "ADDED").containsEntry("action", "UPDATE");
        assertThat(events.stream().map(e -> e.get("photoChange")).toList()).containsExactly("REPLACED", "ADDED", null);
        assertThat(events.get(0)).containsEntry("kind", "CHANGED").containsEntry("hasVersion", true);
        assertThat((List<?>) events.get(0).get("fields")).isEmpty();
        assertThat((List<?>) events.get(1).get("fields")).isEmpty();
    }

    @Test
    void entryChangesOfAPhotoEntryListNoFields() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        UUID photoEntry = entryIds(s).get(1);

        Map<String, Object> changes =
                json(get("/api/groups/" + s.group() + "/audit/" + photoEntry + "/changes", s.token(Who.VIEWER))
                        .body());

        List<Map<String, Object>> items = asObjects(changes.get("items"));
        assertThat(items).hasSize(1);
        assertThat(items.getFirst())
                .containsEntry("contactId", contact.toString())
                .containsEntry("kind", "CHANGED");
        assertThat((List<?>) items.getFirst().get("fields")).isEmpty();
    }

    @Test
    void restoringAnOlderVersionOfAnExistingContactNeverChangesThePhoto() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        long edited = editPhone(s, contact, "02 222 222", 1);
        UUID create = entryIds(s).get(0);
        Long revision = revisionOf("kind = 'CONTACT' and contact_id = ?", contact);
        byte[] photoBefore = download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                .body();

        HttpResponse<String> response = post(
                contactPath(s.group(), contact) + "/restore",
                s.token(Who.EDITOR),
                body(Map.of("from", create.toString(), "version", edited)));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("action", "RESTORE").containsEntry("photoChange", null);
        assertThat(phoneOf(contact)).isEqualTo("01 111 111");
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", contact)).isEqualTo(revision);
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .body())
                .isEqualTo(photoBefore);
    }

    @Test
    void restoringTheStateOfAPhotoEntryWithUnchangedFieldsIsNoChanges() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        UUID photoEntry = entryIds(s).get(1);
        int entries = auditEntries(s.group()).size();

        HttpResponse<String> response = post(
                contactPath(s.group(), contact) + "/restore",
                s.token(Who.EDITOR),
                body(Map.of("from", photoEntry.toString(), "version", 1)));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "RESTORE_NO_CHANGES");
        assertThat(auditEntries(s.group())).hasSize(entries);
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", contact)).isEqualTo(1L);
    }

    @Test
    void restorePreviewOfAPhotoEntryHasNoFieldChanges() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        UUID photoEntry = entryIds(s).get(1);

        Map<String, Object> preview =
                json(get(contactPath(s.group(), contact) + "/restore-preview?from=" + photoEntry, s.token(Who.EDITOR))
                        .body());

        assertThat((List<?>) preview.get("changes")).isEmpty();
        assertThat(preview).containsEntry("restorable", false).containsEntry("reason", "NO_CHANGES");
    }

    @Test
    void rollbackToAPhotoEntryOrBeforeItLeavesThePhotoAndAnUnchangedContactAlone() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        UUID create = entryIds(s).get(0);
        UUID photoEntry = entryIds(s).get(1);

        // vsebina polj je enaka kot po prvem vnosu: ničesar za povrniti
        HttpResponse<String> toPhoto = post(
                "/api/groups/" + s.group() + "/audit/" + photoEntry + "/rollback",
                s.token(Who.ADMIN),
                body(Map.of("latestEntryId", latestEntry(s).toString())));
        HttpResponse<String> toCreate = post(
                "/api/groups/" + s.group() + "/audit/" + create + "/rollback",
                s.token(Who.ADMIN),
                body(Map.of("latestEntryId", latestEntry(s).toString())));

        assertThat(toPhoto.statusCode()).isEqualTo(409);
        assertThat(json(toPhoto.body())).containsEntry("code", "ROLLBACK_NO_CHANGES");
        assertThat(toCreate.statusCode()).isEqualTo(409);
        assertThat(json(toCreate.body())).containsEntry("code", "ROLLBACK_NO_CHANGES");
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", contact)).isEqualTo(1L);
        assertThat(contacts.version(contact)).isEqualTo(1);
    }

    @Test
    void rollbackThatChangesFieldsKeepsTheCurrentPhoto() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s, "Janez", "Novak", "01 111 111");
        addPhoto(s, contact, 0);
        UUID photoEntry = entryIds(s).get(1);
        editPhone(s, contact, "02 222 222", 1);
        addPhoto(s, contact, 2); // zamenjava slike po urejanju: revizija 2
        byte[] photoBefore = download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                .body();

        HttpResponse<String> response = post(
                "/api/groups/" + s.group() + "/audit/" + photoEntry + "/rollback",
                s.token(Who.ADMIN),
                body(Map.of("latestEntryId", latestEntry(s).toString())));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(json(response.body())).containsEntry("action", "ROLLBACK").containsEntry("photoChange", null);
        assertThat(phoneOf(contact)).isEqualTo("01 111 111");
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", contact)).isEqualTo(2L);
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .body())
                .isEqualTo(photoBefore);
    }
}
