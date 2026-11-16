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

/** Slika skupine (FR-018-05, 06, 07, 08, 22): nalaganje, zamenjava, odstranitev, verzija skupine in odgovori seznamov. */
class GroupPhotoIT extends ImageApiTest {

    private static String photo(UUID group) {
        return photoPath(group);
    }

    private HttpResponse<String> remove(UUID group, String token, Object version) throws Exception {
        return Http.send("DELETE", url(photo(group) + "?version=" + version), Http.bearer(token));
    }

    @Test
    @Tag("FR-018-05")
    @Tag("FR-018-06")
    void adminUploadsAndTheGroupVersionRisesWithTheEditor() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = upload(photo(s.group()), s.token(Who.ADMIN), TestImages.jpeg(500, 500), 0L);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsOnlyKeys("photoRevision", "version")
                .containsEntry("photoRevision", 1)
                .containsEntry("version", 1);
        assertThat(groups.version(s.group())).isEqualTo(1);
        assertThat(groups.row(s.group()).get("updated_by")).isEqualTo(s.id(Who.ADMIN));
        assertThat(imageCount("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(1);
    }

    @Test
    @Tag("FR-018-05")
    @Tag("FR-018-07")
    void allRolesReadItAndHeadersAndSizesAreRight() throws Exception {
        Scenario s = scenario();
        upload(photo(s.group()), s.token(Who.OWNER), TestImages.jpeg(800, 800), 0L);

        for (Who who : List.of(Who.OWNER, Who.ADMIN, Who.EDITOR, Who.VIEWER)) {
            HttpResponse<byte[]> response = download(photo(s.group()) + "?size=96", s.token(who));
            assertThat(response.statusCode()).as(who.name()).isEqualTo(200);
            assertThat(response.headers().firstValue("ETag")).hasValue("\"1-96\"");
            assertThat(response.headers().firstValue("Cache-Control").orElse(""))
                    .contains("private");
        }
        assertThat(download(photo(s.group()), s.token(Who.VIEWER), Map.of("If-None-Match", "\"1-256\""))
                        .statusCode())
                .isEqualTo(304);
    }

    @Test
    @Tag("FR-018-05")
    void groupAndArchivedListsAndDetailCarryThePhotoRevision() throws Exception {
        Scenario s = scenario();
        upload(photo(s.group()), s.token(Who.OWNER), TestImages.jpeg(300, 300), 0L);

        Map<String, Object> detail =
                json(get("/api/groups/" + s.group(), s.token(Who.VIEWER)).body());
        assertThat(detail).containsEntry("photoRevision", 1).containsEntry("version", 1);
        Map<String, Object> listed = asObjects(asObject(asObjects(json(get("/api/groups", s.token(Who.VIEWER))
                                                .body())
                                        .get("sections"))
                                .get(0))
                        .get("items"))
                .get(0);
        assertThat(listed).containsEntry("photoRevision", 1);

        groups.archive(s.group());
        Map<String, Object> archived = asObjects(
                        json(get("/api/groups/archived", s.token(Who.OWNER)).body())
                                .get("items"))
                .get(0);
        assertThat(archived).containsEntry("photoRevision", 1);
    }

    @Test
    @Tag("FR-018-05")
    void groupWithoutPhotoHasNullRevisionAndPhotoIs404() throws Exception {
        Scenario s = scenario();

        assertThat(json(get("/api/groups/" + s.group(), s.token(Who.OWNER)).body()))
                .containsEntry("photoRevision", null);
        assertThat(download(photo(s.group()), s.token(Who.OWNER)).statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-018-06")
    void replacementRaisesRevisionAndVersionAndKeepsOneImage() throws Exception {
        Scenario s = scenario();
        upload(photo(s.group()), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 0L);

        HttpResponse<String> response = upload(photo(s.group()), s.token(Who.OWNER), TestImages.jpeg(320, 320), 1L);

        assertThat(json(response.body())).containsEntry("photoRevision", 2).containsEntry("version", 2);
        assertThat(imageCount("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(1);
        assertThat(download(photo(s.group()), s.token(Who.VIEWER)).headers().firstValue("ETag"))
                .hasValue("\"2-256\"");
    }

    @Test
    @Tag("FR-018-06")
    void removalNeedsTheCurrentVersionRaisesItAndIsIdempotent() throws Exception {
        Scenario s = scenario();
        upload(photo(s.group()), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 0L);

        HttpResponse<String> removed = remove(s.group(), s.token(Who.ADMIN), 1);
        HttpResponse<String> again = remove(s.group(), s.token(Who.ADMIN), 2);

        assertThat(removed.statusCode()).isEqualTo(200);
        assertThat(json(removed.body())).containsEntry("photoRevision", null).containsEntry("version", 2);
        assertThat(again.statusCode()).isEqualTo(200);
        assertThat(json(again.body())).containsEntry("photoRevision", null).containsEntry("version", 2);
        assertThat(groups.version(s.group())).isEqualTo(2);
        assertThat(imageCountForGroup(s.group())).isZero();
        assertThat(download(photo(s.group()), s.token(Who.OWNER)).statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-018-06")
    void staleVersionIsAConflictWithTheCurrentGroupAndChangesNothing() throws Exception {
        Scenario s = scenario();
        upload(photo(s.group()), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 0L);

        HttpResponse<String> upload = upload(photo(s.group()), s.token(Who.OWNER), TestImages.jpeg(310, 310), 0L);
        HttpResponse<String> delete = remove(s.group(), s.token(Who.OWNER), 0);

        for (HttpResponse<String> response : List.of(upload, delete)) {
            assertThat(response.statusCode()).isEqualTo(409);
            Map<String, Object> body = json(response.body());
            assertThat(body).containsOnlyKeys("code", "current").containsEntry("code", "VERSION_CONFLICT");
            assertThat(asObject(body.get("current")))
                    .containsEntry("id", s.group().toString())
                    .containsEntry("version", 1)
                    .containsEntry("photoRevision", 1);
        }
        assertThat(groups.version(s.group())).isEqualTo(1);
        assertThat(revisionOf("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(1L);
    }

    @Test
    @Tag("FR-018-06")
    void editingTheGroupDetailsInvalidatesAnOlderPhotoVersion() throws Exception {
        Scenario s = scenario();
        String edit = "{\"title\":\"Nov naslov\",\"description\":null,\"color\":\"mah\",\"version\":0}";
        assertThat(put("/api/groups/" + s.group(), s.token(Who.ADMIN), edit).statusCode())
                .isEqualTo(200);

        HttpResponse<String> response = upload(photo(s.group()), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 0L);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(imageCountForGroup(s.group())).isZero();
        // naslednje urejanje podatkov z verzijo po sliki uspe
        HttpResponse<String> uploaded = upload(photo(s.group()), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 1L);
        assertThat(json(uploaded.body())).containsEntry("version", 2);
        String next = "{\"title\":\"Še en naslov\",\"description\":null,\"color\":\"mah\",\"version\":2}";
        assertThat(put("/api/groups/" + s.group(), s.token(Who.ADMIN), next).statusCode())
                .isEqualTo(200);
        assertThat(revisionOf("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(1L);
    }

    @Test
    @Tag("FR-018-06")
    void versionIsRequiredAndMustBeANumber() throws Exception {
        Scenario s = scenario();
        byte[] file = TestImages.jpeg(300, 300);

        HttpResponse<String> missing = upload(photo(s.group()), s.token(Who.ADMIN), file, null);
        HttpResponse<String> invalid = multipart(
                "PUT", photo(s.group()), s.token(Who.ADMIN), List.of(Part.file(file), Part.field("version", "abc")));
        HttpResponse<String> deleteMissing =
                Http.send("DELETE", url(photo(s.group())), Http.bearer(s.token(Who.ADMIN)));

        assertThat(missing.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(missing.body())).containsEntry("version", "REQUIRED");
        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(invalid.body())).containsEntry("version", "INVALID_VALUE");
        assertThat(deleteMissing.statusCode()).isEqualTo(400);
        assertThat(imageCountForGroup(s.group())).isZero();
        assertThat(groups.version(s.group())).isZero();
    }

    @Test
    @Tag("FR-018-14")
    void invalidFileIsRejectedAfterTheVersionCheckAndChangesNothing() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> invalid = upload(photo(s.group()), s.token(Who.ADMIN), "GIF89a....".getBytes(), 0L);
        HttpResponse<String> staleAndInvalid =
                upload(photo(s.group()), s.token(Who.ADMIN), "GIF89a....".getBytes(), 7L);

        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(invalid.body())).containsEntry("file", "INVALID_IMAGE");
        assertThat(staleAndInvalid.statusCode()).as("409 pride pred 400").isEqualTo(409);
        assertThat(groups.version(s.group())).isZero();
        assertThat(imageCountForGroup(s.group())).isZero();
    }

    @Test
    @Tag("FR-018-06")
    void concurrentUploadsWithTheSameVersionLetExactlyOneWin() throws Exception {
        Scenario s = scenario();
        byte[] file = TestImages.jpeg(300, 300);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Callable<Integer>> calls = java.util.stream.IntStream.range(0, 4)
                    .<Callable<Integer>>mapToObj(i -> () -> upload(photo(s.group()), s.token(Who.ADMIN), file, 0L)
                            .statusCode())
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
        assertThat(groups.version(s.group())).isEqualTo(1);
        assertThat(revisionOf("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(1L);
    }

    @Test
    @Tag("FR-018-12")
    void deletingTheGroupDeletesItsPhotosEvenForDetachedContacts() throws Exception {
        Scenario s = scenario();
        upload(photo(s.group()), s.token(Who.OWNER), TestImages.jpeg(300, 300), 0L);
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), TestImages.jpeg(300, 300), 0L);
        jdbc.update("delete from contact where id = ?", contact);
        assertThat(imageCountForGroup(s.group())).isEqualTo(2);
        jdbc.update("delete from group_member where group_id = ? and role <> 'OWNER'", s.group());

        HttpResponse<String> deleted =
                Http.send("DELETE", url("/api/groups/" + s.group()), Http.bearer(s.token(Who.OWNER)));

        assertThat(deleted.statusCode()).isEqualTo(204);
        assertThat(imageCountForGroup(s.group())).isZero();
        assertThat(jdbc.queryForObject(
                        "select count(*) from image_variant v where not exists"
                                + " (select 1 from image i where i.id = v.image_id)",
                        Integer.class))
                .isZero();
    }
}
