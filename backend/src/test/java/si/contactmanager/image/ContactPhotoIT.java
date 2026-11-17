package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.Http;

/**
 * Slika kontakta (FR-018-09, 10, 22): nalaganje, zamenjava, odstranitev v isti transakciji z verzijo kontakta in vnosom
 * v sledi, konflikt verzij, seznam in pogled z {@code photoRevision}.
 */
class ContactPhotoIT extends ImageApiTest {

    private HttpResponse<String> remove(Scenario s, Who who, UUID contact, Object version) throws Exception {
        return Http.send(
                "DELETE", url(contactPhotoPath(s.group(), contact) + "?version=" + version), Http.bearer(s.token(who)));
    }

    private HttpResponse<String> add(Scenario s, Who who, UUID contact, long version) throws Exception {
        return upload(contactPhotoPath(s.group(), contact), s.token(who), TestImages.jpeg(400, 300), version);
    }

    private UUID create(Scenario s) throws Exception {
        return idOf(createViaApi(s, input("Janez", "Novak")));
    }

    @Test
    @Tag("FR-018-09")
    @Tag("FR-018-10")
    void uploadRaisesContactVersionKeepsFieldsAndWritesOneAuditEntry() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        Map<String, Object> before = contacts.row(contact);
        int entriesBefore = auditEntries(s.group()).size();

        HttpResponse<String> response = add(s, Who.EDITOR, contact, 0);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsOnlyKeys("photoRevision", "version")
                .containsEntry("photoRevision", 1)
                .containsEntry("version", 1);
        Map<String, Object> after = contacts.row(contact);
        assertThat(after.get("version")).isEqualTo(1L);
        assertThat(after.get("updated_by")).isEqualTo(s.id(Who.EDITOR));
        assertThat(after)
                .containsEntry("first_name", before.get("first_name"))
                .containsEntry("last_name", before.get("last_name"))
                .containsEntry("email", before.get("email"));
        List<Map<String, Object>> entries = auditEntries(s.group());
        assertThat(entries).hasSize(entriesBefore + 1);
        Map<String, Object> entry = entries.getLast();
        assertThat(entry).containsEntry("action", "UPDATE").containsEntry("photo_change", "ADDED");
        assertThat(entry.get("contact_count")).isEqualTo(1);
    }

    @Test
    @Tag("FR-018-09")
    void replacementAndRemovalAreRecordedAsReplacedAndRemoved() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        add(s, Who.EDITOR, contact, 0);

        HttpResponse<String> replaced = add(s, Who.ADMIN, contact, 1);
        HttpResponse<String> removed = remove(s, Who.OWNER, contact, 2);

        assertThat(json(replaced.body())).containsEntry("photoRevision", 2).containsEntry("version", 2);
        assertThat(json(removed.body())).containsEntry("photoRevision", null).containsEntry("version", 3);
        assertThat(auditEntries(s.group()).stream()
                        .map(e -> e.get("photo_change"))
                        .toList())
                .containsExactly(null, "ADDED", "REPLACED", "REMOVED");
        assertThat(contactImageRow(s.group(), contact)).isNull();
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-018-09")
    void removalWithoutAPhotoIsIdempotentAndWritesNothing() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        int entries = auditEntries(s.group()).size();

        HttpResponse<String> response = remove(s, Who.EDITOR, contact, 0);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("photoRevision", null).containsEntry("version", 0);
        assertThat(contacts.version(contact)).isZero();
        assertThat(auditEntries(s.group())).hasSize(entries);
    }

    @Test
    @Tag("FR-018-09")
    void listAndDetailCarryThePhotoRevisionAndTheVersionUsableForTheNextEdit() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        UUID plain = idOf(createViaApi(s, input("Brez", "Slike")));
        add(s, Who.EDITOR, contact, 0);

        Map<String, Object> detail =
                json(get(contactPath(s.group(), contact), s.token(Who.VIEWER)).body());
        List<Map<String, Object>> items = asObjects(
                json(get(contactsPath(s.group()), s.token(Who.VIEWER)).body()).get("items"));

        assertThat(detail).containsEntry("photoRevision", 1).containsEntry("version", 1);
        assertThat(items)
                .filteredOn(item -> item.get("id").equals(contact.toString()))
                .singleElement()
                .satisfies(item ->
                        assertThat(item).containsEntry("photoRevision", 1).containsEntry("version", 1));
        assertThat(items)
                .filteredOn(item -> item.get("id").equals(plain.toString()))
                .singleElement()
                .satisfies(item -> assertThat(item).containsEntry("photoRevision", null));
        // urejanje polj z verzijo po sliki uspe in sliko ohrani
        HttpResponse<String> edit = put(
                contactPath(s.group(), contact), s.token(Who.EDITOR), body(withVersion(input("Janez", "Kralj"), 1)));
        assertThat(edit.statusCode()).isEqualTo(200);
        assertThat(revisionOf("kind = 'CONTACT' and group_id = ? and contact_id = ?", s.group(), contact))
                .isEqualTo(1L);
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(200);
    }

    @Test
    @Tag("FR-018-09")
    void staleVersionIsAConflictWithTheCurrentContactAndNothingChanges() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        contacts.editedByOther(contact, s.id(Who.ADMIN), "031 111 222");
        int entries = auditEntries(s.group()).size();

        HttpResponse<String> upload = add(s, Who.EDITOR, contact, 0);
        HttpResponse<String> delete = remove(s, Who.EDITOR, contact, 0);

        for (HttpResponse<String> response : List.of(upload, delete)) {
            assertThat(response.statusCode()).isEqualTo(409);
            Map<String, Object> body = json(response.body());
            assertThat(body).containsOnlyKeys("code", "current").containsEntry("code", "VERSION_CONFLICT");
            assertThat(asObject(body.get("current")))
                    .containsEntry("id", contact.toString())
                    .containsEntry("version", 1)
                    .containsEntry("phone", "031 111 222");
        }
        assertThat(contactImageRow(s.group(), contact)).isNull();
        assertThat(contacts.version(contact)).isEqualTo(1);
        assertThat(auditEntries(s.group())).hasSize(entries);
    }

    @Test
    @Tag("FR-018-09")
    void invalidFileIsRejectedAfterTheVersionCheckAndChangesNothing() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        int entries = auditEntries(s.group()).size();
        byte[] junk = "MZ\u0090\u0000".getBytes();

        HttpResponse<String> invalid = upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), junk, 0L);
        HttpResponse<String> stale = upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), junk, 9L);

        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(invalid.body())).containsEntry("file", "INVALID_IMAGE");
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(contacts.version(contact)).isZero();
        assertThat(auditEntries(s.group())).hasSize(entries);
    }

    @Test
    @Tag("FR-018-09")
    void versionIsRequired() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);

        HttpResponse<String> upload =
                upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), TestImages.jpeg(100, 100), null);
        HttpResponse<String> delete =
                Http.send("DELETE", url(contactPhotoPath(s.group(), contact)), Http.bearer(s.token(Who.EDITOR)));

        assertThat(upload.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(upload.body())).containsEntry("version", "REQUIRED");
        assertThat(delete.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(delete.body())).containsEntry("version", "REQUIRED");
    }

    @Test
    @Tag("FR-018-09")
    void concurrentUploadsWithTheSameVersionLetExactlyOneWin() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Callable<Integer>> calls = java.util.stream.IntStream.range(0, 4)
                    .<Callable<Integer>>mapToObj(
                            i -> () -> add(s, Who.EDITOR, contact, 0).statusCode())
                    .toList();
            List<Integer> statuses = pool.invokeAll(calls).stream()
                    .map(f -> {
                        try {
                            return f.get();
                        } catch (Exception e) {
                            throw new IllegalStateException(e);
                        }
                    })
                    .toList();

            assertThat(statuses)
                    .containsOnly(200, 409)
                    .filteredOn(code -> code == 200)
                    .hasSize(1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(contacts.version(contact)).isEqualTo(1);
        assertThat(auditEntries(s.group()).stream()
                        .filter(e -> e.get("photo_change") != null)
                        .count())
                .isEqualTo(1);
    }

    @Test
    @Tag("FR-018-09")
    void deletedContactHasNoPhotoThroughTheApiAndRejectsChanges() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        add(s, Who.EDITOR, contact, 0);
        assertThat(delete(contactPath(s.group(), contact) + "?version=1", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);

        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.OWNER))
                        .statusCode())
                .isEqualTo(404);
        assertThat(add(s, Who.EDITOR, contact, 1).statusCode()).isEqualTo(404);
        assertThat(remove(s, Who.EDITOR, contact, 1).statusCode()).isEqualTo(404);
        assertThat(contactImageRow(s.group(), contact)).containsKey("detached_at");
        assertThat(contactImageRow(s.group(), contact).get("detached_at")).isNotNull();
    }

    @Test
    @Tag("FR-018-22")
    void photoIsServedWithSizesAndEtag() throws Exception {
        Scenario s = scenario();
        UUID contact = create(s);
        add(s, Who.EDITOR, contact, 0);

        HttpResponse<byte[]> small = download(contactPhotoPath(s.group(), contact) + "?size=96", s.token(Who.VIEWER));
        HttpResponse<byte[]> cached = download(
                contactPhotoPath(s.group(), contact) + "?size=96",
                s.token(Who.VIEWER),
                Map.of("If-None-Match", "\"1-96\""));

        assertThat(small.statusCode()).isEqualTo(200);
        assertThat(small.headers().firstValue("ETag")).hasValue("\"1-96\"");
        assertThat(small.headers().firstValue("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(cached.statusCode()).isEqualTo(304);
    }
}
