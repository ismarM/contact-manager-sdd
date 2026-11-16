package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;

/**
 * Slike pri združevanju dvojnikov (FR-018-11): preživeli ohrani svojo; sicer prevzame sliko prvega poraženega (po
 * starosti), slike ostalih se izbrišejo; nič ne ostane v tabeli {@code image}; dvojniki in primerjava vsebujejo
 * {@code photoRevision}.
 */
@Tag("FR-018-11")
class ContactPhotoMergeIT extends ImageApiTest {

    private static final Instant BASE = Instant.parse("2026-02-01T10:00:00Z");

    private static byte[] solid(Color color) {
        BufferedImage image = new BufferedImage(300, 300, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, 300, 300);
        g.dispose();
        return TestImages.jpeg(image);
    }

    /** Trije kontakti z istim e-naslovom, od najstarejšega: A, B, C. */
    private List<UUID> three(Scenario s) {
        return contacts.insertDuplicates(s.group(), s.id(Who.OWNER), 3, "dvojnik@primer.si");
    }

    private void photo(Scenario s, UUID contact, Color color) throws Exception {
        assertThat(upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), solid(color), 0L)
                        .statusCode())
                .isEqualTo(200);
    }

    private HttpResponse<String> merge(Scenario s, List<UUID> ids) throws Exception {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UUID id : ids) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", id.toString());
            row.put("version", contacts.version(id));
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("firstName", "Janez");
        result.put("lastName", "Novak");
        result.put("email", "dvojnik@primer.si");
        result.put("attributes", List.of());
        result.put("tags", List.of());
        return post(
                "/api/groups/" + s.group() + "/duplicates/merge",
                s.token(Who.EDITOR),
                body(Map.of("contacts", rows, "result", result)));
    }

    private byte[] imageOf(Scenario s, UUID contact) throws Exception {
        HttpResponse<byte[]> response = download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER));
        assertThat(response.statusCode()).isEqualTo(200);
        return response.body();
    }

    @Test
    void survivorWithAPhotoKeepsItAndTheLosersPhotosAreDeleted() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);
        photo(s, ids.get(0), Color.RED);
        photo(s, ids.get(1), Color.GREEN);
        photo(s, ids.get(2), Color.BLUE);
        byte[] keeperBefore = imageOf(s, ids.get(0));
        Long revision = revisionOf("kind = 'CONTACT' and contact_id = ?", ids.get(0));

        HttpResponse<String> response = merge(s, ids);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(imageOf(s, ids.get(0))).isEqualTo(keeperBefore);
        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", ids.get(0)))
                .isEqualTo(revision);
        assertThat(imageCountForGroup(s.group())).as("ni ostankov poraženih").isEqualTo(1);
        assertThat(contactImageRow(s.group(), ids.get(1))).isNull();
        assertThat(contactImageRow(s.group(), ids.get(2))).isNull();
        assertContactImageInvariant();
    }

    @Test
    void survivorWithoutAPhotoAdoptsTheFirstLosersPhotoByAge() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);
        photo(s, ids.get(1), Color.GREEN);
        photo(s, ids.get(2), Color.BLUE);
        byte[] firstLoser = imageOf(s, ids.get(1));

        HttpResponse<String> response = merge(s, ids);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(imageOf(s, ids.get(0))).isEqualTo(firstLoser);
        assertThat(imageCountForGroup(s.group())).isEqualTo(1);
        assertThat(contactImageRow(s.group(), ids.get(0))).containsEntry("detached_at", null);
        assertThat(contactImageRow(s.group(), ids.get(1))).isNull();
        assertThat(contactImageRow(s.group(), ids.get(2))).isNull();
        assertContactImageInvariant();
    }

    @Test
    void onlyTheSecondLoserHasAPhotoAndItIsAdopted() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);
        photo(s, ids.get(2), Color.BLUE);
        byte[] only = imageOf(s, ids.get(2));

        merge(s, ids);

        assertThat(imageOf(s, ids.get(0))).isEqualTo(only);
        assertThat(imageCountForGroup(s.group())).isEqualTo(1);
    }

    @Test
    void noPhotoAnywhereLeavesNoPhoto() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);

        HttpResponse<String> response = merge(s, ids);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(imageCountForGroup(s.group())).isZero();
        assertThat(download(contactPhotoPath(s.group(), ids.get(0)), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    void mergedContactShowsThePhotoRevisionAndTheMergeEntryHasNoPhotoChange() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);
        photo(s, ids.get(1), Color.GREEN);

        merge(s, ids);

        Map<String, Object> detail = json(
                get(contactPath(s.group(), ids.get(0)), s.token(Who.VIEWER)).body());
        assertThat(detail.get("photoRevision")).isNotNull();
        List<Map<String, Object>> entries = auditEntries(s.group());
        assertThat(entries.getLast()).containsEntry("action", "MERGE").containsEntry("photo_change", null);
    }

    @Test
    void failedMergeKeepsAllPhotos() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);
        photo(s, ids.get(1), Color.GREEN);
        photo(s, ids.get(2), Color.BLUE);

        // zastarela verzija enega kontakta: zahtevek je zavrnjen in slike ostanejo
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UUID id : ids) {
            rows.add(Map.of("id", id.toString(), "version", 99));
        }
        HttpResponse<String> response = post(
                "/api/groups/" + s.group() + "/duplicates/merge",
                s.token(Who.EDITOR),
                body(Map.of(
                        "contacts",
                        rows,
                        "result",
                        Map.of("firstName", "Janez", "attributes", List.of(), "tags", List.of()))));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(imageCountForGroup(s.group())).isEqualTo(2);
        assertContactImageInvariant();
    }

    @Test
    void duplicatesAndCompareCarryThePhotoRevisionOfTheirContacts() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = three(s);
        photo(s, ids.get(1), Color.GREEN);

        Map<String, Object> page =
                json(get("/api/groups/" + s.group() + "/duplicates?category=email", s.token(Who.EDITOR))
                        .body());
        List<Map<String, Object>> found =
                asObjects(asObject(asObjects(page.get("groups")).get(0)).get("contacts"));
        Map<String, Object> compare = json(get(
                        "/api/groups/" + s.group() + "/duplicates/compare?ids=" + ids.get(0) + "," + ids.get(1) + ","
                                + ids.get(2),
                        s.token(Who.EDITOR))
                .body());
        List<Map<String, Object>> compared = asObjects(compare.get("contacts"));

        for (List<Map<String, Object>> list : List.of(found, compared)) {
            assertThat(list).hasSize(3);
            for (Map<String, Object> contact : list) {
                boolean withPhoto = contact.get("id").equals(ids.get(1).toString());
                if (withPhoto) {
                    assertThat(contact).containsEntry("photoRevision", 1);
                } else {
                    assertThat(contact).containsKey("photoRevision").containsEntry("photoRevision", null);
                }
            }
        }
    }
}
