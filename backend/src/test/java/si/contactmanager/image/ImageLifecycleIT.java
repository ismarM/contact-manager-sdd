package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;

/**
 * Življenjski cikel slik kontaktov (FR-018-12; plan.md dopolnitev 2): izbris (tudi množični), obnova (015), rollback
 * skupine, uvoz, izbris skupine ter sprožilca na tabeli {@code contact}. Invarianta po vsakem testu: slika kontakta je
 * priklopljena natanko tedaj, ko kontakt obstaja; ni slik brez lastnika.
 */
@Tag("FR-018-12")
class ImageLifecycleIT extends ImageApiTest {

    private UUID createContact(Scenario s, String first, String last) throws Exception {
        return idOf(createViaApi(s, input(first, last)));
    }

    private void addPhoto(Scenario s, UUID contact, long version) throws Exception {
        HttpResponse<String> response =
                upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), TestImages.jpeg(300, 300), version);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    }

    private List<UUID> entryIds(Scenario s) {
        return auditEntries(s.group()).stream().map(e -> (UUID) e.get("id")).toList();
    }

    private UUID latestEntry(Scenario s) {
        return jdbc.queryForObject("select last_entry_id from audit_head where group_id = ?", UUID.class, s.group());
    }

    private HttpResponse<String> rollbackToEntry(Scenario s, UUID entry) throws Exception {
        return post(
                "/api/groups/" + s.group() + "/audit/" + entry + "/rollback",
                s.token(Who.ADMIN),
                body(Map.of("latestEntryId", latestEntry(s).toString())));
    }

    private HttpResponse<String> rollbackToInitial(Scenario s) throws Exception {
        return post(
                "/api/groups/" + s.group() + "/audit/initial-state/rollback",
                s.token(Who.ADMIN),
                body(Map.of("latestEntryId", latestEntry(s).toString())));
    }

    private boolean attached(Scenario s, UUID contact) {
        Map<String, Object> row = contactImageRow(s.group(), contact);
        return row != null && row.get("detached_at") == null;
    }

    // --- izbris ---

    @Test
    void deletingAContactDetachesItsPhotoAndTheApiNoLongerServesIt() throws Exception {
        Scenario s = scenario();
        UUID contact = createContact(s, "Janez", "Novak");
        addPhoto(s, contact, 0);
        assertThat(attached(s, contact)).isTrue();

        assertThat(delete(contactPath(s.group(), contact) + "?version=1", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);

        assertThat(contactImageRow(s.group(), contact)).isNotNull();
        assertThat(attached(s, contact)).isFalse();
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.OWNER))
                        .statusCode())
                .isEqualTo(404);
        assertContactImageInvariant();
    }

    @Test
    void bulkDeleteOfFiftyContactsWithPhotosDetachesAllOfThem() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 60);
        List<UUID> withPhotos = ids.subList(0, 50);
        seedContactImages(s.group(), withPhotos);
        assertThat(imageCountForGroup(s.group())).isEqualTo(50);

        HttpResponse<String> response = bulkDelete(s.token(Who.EDITOR), s.group(), request(withPhotos));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("deleted", 50);
        assertThat(imageCount("group_id = ? and detached_at is not null", s.group()))
                .isEqualTo(50);
        assertThat(download(contactPhotoPath(s.group(), withPhotos.getFirst()), s.token(Who.OWNER))
                        .statusCode())
                .isEqualTo(404);
        assertContactImageInvariant();
    }

    @Test
    void thousandContactsWithPhotosAreDeletedAndReattachedInReasonableTime() throws Exception {
        // sprožilca sta vrstična: izbris 1000 kontaktov s slikami in ponoven vnos morata biti v razumnem času
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 1000);
        seedContactImages(s.group(), ids);
        UUID group = s.group();

        long start = System.nanoTime();
        jdbc.update("delete from contact where group_id = ?", group);
        Duration deleteTime = Duration.ofNanos(System.nanoTime() - start);

        assertThat(imageCount("group_id = ? and detached_at is not null", group))
                .isEqualTo(1000);
        assertThat(deleteTime).isLessThan(Duration.ofSeconds(15));
        assertContactImageInvariant();

        // ponovna ustvaritev z istimi id priklopi vse slike
        long insertStart = System.nanoTime();
        jdbc.update(
                "insert into contact (id, group_id, first_name, sort_first, updated_by)"
                        + " select u, ?, 'Ime', 'ime', ? from unnest(?::uuid[]) u",
                ps -> {
                    ps.setObject(1, group);
                    ps.setLong(2, jdbc.queryForObject("select min(id) from app_user", Long.class));
                    ps.setArray(3, ps.getConnection().createArrayOf("uuid", ids.toArray()));
                });
        Duration insertTime = Duration.ofNanos(System.nanoTime() - insertStart);
        assertThat(imageCount("group_id = ? and detached_at is null", group)).isEqualTo(1000);
        assertThat(insertTime).isLessThan(Duration.ofSeconds(15));
        assertContactImageInvariant();
    }

    // --- obnova (015) ---

    @Test
    void restoringADeletedContactBringsItsPhotoBack() throws Exception {
        Scenario s = scenario();
        UUID contact = createContact(s, "Janez", "Novak");
        addPhoto(s, contact, 0);
        byte[] before = download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                .body();
        assertThat(delete(contactPath(s.group(), contact) + "?version=1", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);
        UUID photoEntry = entryIds(s).get(1);

        HttpResponse<String> restored = post(
                contactPath(s.group(), contact) + "/restore",
                s.token(Who.EDITOR),
                body(Map.of(
                        "from",
                        photoEntry.toString(),
                        "lastEntryId",
                        latestEntry(s).toString())));

        assertThat(restored.statusCode()).as(restored.body()).isEqualTo(201);
        assertThat(attached(s, contact)).isTrue();
        HttpResponse<byte[]> photo = download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER));
        assertThat(photo.statusCode()).isEqualTo(200);
        assertThat(photo.body()).isEqualTo(before);
        assertContactImageInvariant();
    }

    @Test
    void restoringAContactWithoutAPhotoOrWithAnAlreadyRemovedPhotoIsFine() throws Exception {
        Scenario s = scenario();
        UUID plain = createContact(s, "Brez", "Slike");
        UUID removed = createContact(s, "Odstranjena", "Slika");
        addPhoto(s, removed, 0);
        assertThat(removePhoto(s, removed, 1).statusCode()).isEqualTo(200);
        assertThat(delete(contactPath(s.group(), plain) + "?version=0", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);
        assertThat(delete(contactPath(s.group(), removed) + "?version=2", s.token(Who.EDITOR))
                        .statusCode())
                .isEqualTo(204);

        for (UUID contact : List.of(plain, removed)) {
            UUID from = jdbc.queryForObject(
                    "select e.id from audit_entry e join audit_change c on c.entry_id = e.id"
                            + " where e.group_id = ? and c.contact_id = ? and c.after is not null"
                            + " order by e.seq desc limit 1",
                    UUID.class,
                    s.group(),
                    contact);
            UUID last = jdbc.queryForObject(
                    "select e.id from audit_entry e join audit_change c on c.entry_id = e.id"
                            + " where e.group_id = ? and c.contact_id = ? order by e.seq desc limit 1",
                    UUID.class,
                    s.group(),
                    contact);
            HttpResponse<String> restored = post(
                    contactPath(s.group(), contact) + "/restore",
                    s.token(Who.EDITOR),
                    body(Map.of("from", from.toString(), "lastEntryId", last.toString())));
            assertThat(restored.statusCode()).as(restored.body()).isEqualTo(201);
            assertThat(contactImageRow(s.group(), contact)).isNull();
            assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                            .statusCode())
                    .isEqualTo(404);
        }
        assertContactImageInvariant();
    }

    private HttpResponse<String> removePhoto(Scenario s, UUID contact, long version) throws Exception {
        return si.contactmanager.support.Http.send(
                "DELETE",
                url(contactPhotoPath(s.group(), contact) + "?version=" + version),
                si.contactmanager.support.Http.bearer(s.token(Who.EDITOR)));
    }

    // --- rollback skupine ---

    @Test
    void groupRollbackThatRemovesAndRecreatesAContactCarriesThePhotoAlong() throws Exception {
        Scenario s = scenario();
        UUID contact = createContact(s, "Janez", "Novak");
        addPhoto(s, contact, 0);
        UUID photoEntry = entryIds(s).get(1);
        byte[] before = download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                .body();

        HttpResponse<String> toInitial = rollbackToInitial(s);
        assertThat(toInitial.statusCode()).as(toInitial.body()).isEqualTo(201);
        assertThat(contacts.exists(contact)).isFalse();
        assertThat(attached(s, contact)).isFalse();
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
        assertContactImageInvariant();

        HttpResponse<String> back = rollbackToEntry(s, photoEntry);
        assertThat(back.statusCode()).as(back.body()).isEqualTo(201);
        assertThat(contacts.exists(contact)).isTrue();
        assertThat(attached(s, contact)).isTrue();
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .body())
                .isEqualTo(before);
        assertContactImageInvariant();
    }

    // --- uvoz (014) ---

    @Test
    void importCreatesContactsWithoutPhotos() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = commit(
                s.token(Who.EDITOR), s.group(), "XLSX", List.of(person("Ana", "Uvožena"), person("Bojan", "Uvožen")));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        assertThat(contacts.count(s.group())).isEqualTo(2);
        assertThat(imageCountForGroup(s.group())).isZero();
    }

    // --- izbris skupine in sprožilci ---

    @Test
    void deletingTheGroupDeletesAllPhotosIncludingDetachedOnesAndTheirVariants() throws Exception {
        Scenario s = scenario();
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.OWNER), 5);
        seedContactImages(s.group(), ids);
        jdbc.update("delete from contact where id in (?, ?)", ids.get(0), ids.get(1));
        assertThat(imageCount("group_id = ? and detached_at is not null", s.group()))
                .isEqualTo(2);

        jdbc.update("delete from contact_group where id = ?", s.group());

        assertThat(imageCountForGroup(s.group())).isZero();
        assertThat(jdbc.queryForObject(
                        "select count(*) from image_variant v where not exists"
                                + " (select 1 from image i where i.id = v.image_id)",
                        Integer.class))
                .isZero();
        assertContactImageInvariant();
    }

    @Test
    void triggersOnlyTouchTheImageOfTheSameGroupAndContact() throws Exception {
        Scenario mine = scenario();
        Scenario other = scenario();
        UUID contact = contacts.insert(mine.group(), mine.id(Who.OWNER), "Janez", "Novak");
        // slika z istim id kontakta v drugi skupini (brez kontakta tam): brisanje v moji skupini je ne sme odklopiti
        jdbc.update(
                "insert into image (kind, group_id, contact_id, detached_at) values ('CONTACT', ?, ?, now())",
                other.group(),
                contact);
        seedContactImages(mine.group(), List.of(contact));

        jdbc.update("delete from contact where id = ?", contact);

        assertThat(attached(mine, contact)).isFalse();
        Map<String, Object> foreign = contactImageRow(other.group(), contact);
        assertThat(foreign.get("detached_at"))
                .as("slika tuje skupine ostane, kot je bila")
                .isNotNull();
        // ponovni vnos kontakta v moji skupini priklopi samo mojo sliko
        jdbc.update(
                "insert into contact (id, group_id, first_name, sort_first, updated_by) values (?, ?, 'Janez', 'janez', ?)",
                contact,
                mine.group(),
                mine.id(Who.OWNER));
        assertThat(attached(mine, contact)).isTrue();
        assertThat(contactImageRow(other.group(), contact).get("detached_at")).isNotNull();
    }

    @Test
    void accountDeletionLeavesGroupAndContactPhotosOfTheDeletedUser() throws Exception {
        Scenario s = scenario();
        UUID contact = createContact(s, "Janez", "Novak");
        addPhoto(s, contact, 0);

        // izbris profila uporabnika, ki je sliko naložil (kot izbris računa, 012): slika kontakta pripada skupini
        long editor = s.id(Who.EDITOR);
        jdbc.update("delete from group_member where user_id = ?", editor);
        jdbc.update("update contact set updated_by = null where updated_by = ?", editor);
        jdbc.update("update contact_group set updated_by = null where updated_by = ?", editor);
        jdbc.update("update audit_entry set actor_id = null where actor_id = ?", editor);
        jdbc.update("delete from app_user where id = ?", editor);

        assertThat(attached(s, contact)).isTrue();
        assertContactImageInvariant();
    }
}
