package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import si.contactmanager.contact.support.ContactFixtures;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;

/**
 * Shema slik (data-model.md; FR-018-12, FR-018-19): omejitve tabel {@code image} in {@code image_variant}, ena slika na
 * lastnika, kaskade, omejitev stolpca {@code audit_entry.photo_change}.
 */
@Tag("FR-018-12")
@Tag("FR-018-19")
class ImageSchemaIT extends ApiTest {

    private GroupFixtures groups;
    private ContactFixtures contacts;
    private long user;
    private UUID group;

    @BeforeEach
    void setUp() throws Exception {
        groups = new GroupFixtures(jdbc);
        contacts = new ContactFixtures(jdbc);
        user = groups.userId(registeredUser("Ana Novak").uid());
        group = groups.createGroup(user, "Skupina slik");
    }

    private void insertImage(String sql, Object... args) {
        jdbc.update(sql, args);
    }

    private UUID imageId(String where, Object... args) {
        return jdbc.queryForObject("select id from image where " + where, UUID.class, args);
    }

    @Test
    void kindAndOwnerColumnsMustMatch() {
        UUID contact = UUID.randomUUID();
        assertThatThrownBy(() -> insertImage("insert into image (kind, user_id) values ('FOO', ?)", user))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage("insert into image (kind) values ('USER')"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() ->
                        insertImage("insert into image (kind, user_id, group_id) values ('USER', ?, ?)", user, group))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage("insert into image (kind, group_id) values ('CONTACT', ?)", group))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage(
                        "insert into image (kind, group_id, contact_id) values ('GROUP', ?, ?)", group, contact))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage("insert into image (kind, contact_id) values ('CONTACT', ?)", contact))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void onlyContactImagesCanBeDetachedAndRevisionStartsAtOne() {
        assertThatThrownBy(() ->
                        insertImage("insert into image (kind, user_id, detached_at) values ('USER', ?, now())", user))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage("insert into image (kind, user_id, revision) values ('USER', ?, 0)", user))
                .isInstanceOf(DataIntegrityViolationException.class);
        insertImage("insert into image (kind, user_id) values ('USER', ?)", user);
        assertThat(jdbc.queryForObject("select revision from image where user_id = ?", Long.class, user))
                .isEqualTo(1);
    }

    @Test
    void anOwnerCanHaveOnlyOneImage() {
        UUID contact = contacts.insert(group, user, "Janez", "Novak");
        insertImage("insert into image (kind, user_id) values ('USER', ?)", user);
        insertImage("insert into image (kind, group_id) values ('GROUP', ?)", group);
        insertImage("insert into image (kind, group_id, contact_id) values ('CONTACT', ?, ?)", group, contact);

        assertThatThrownBy(() -> insertImage("insert into image (kind, user_id) values ('USER', ?)", user))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage("insert into image (kind, group_id) values ('GROUP', ?)", group))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage(
                        "insert into image (kind, group_id, contact_id) values ('CONTACT', ?, ?)", group, contact))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void contactImageHasNoForeignKeyToTheContactButGroupAndUserMustExist() {
        // kontakt je lahko izbrisan in obnovljen z istim id: ni tujega ključa
        insertImage(
                "insert into image (kind, group_id, contact_id, detached_at) values ('CONTACT', ?, ?, now())",
                group,
                UUID.randomUUID());
        assertThatThrownBy(
                        () -> insertImage("insert into image (kind, group_id) values ('GROUP', ?)", UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertImage("insert into image (kind, user_id) values ('USER', ?)", Long.MAX_VALUE))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void variantsAreRestrictedToKnownSizesAndTypesWithOneRowPerSize() {
        insertImage("insert into image (kind, user_id) values ('USER', ?)", user);
        UUID image = imageId("user_id = ?", user);
        jdbc.update(
                "insert into image_variant (image_id, size, content_type, data) values (?, 96, 'image/jpeg', ?)",
                image,
                new byte[] {1});

        assertThatThrownBy(() -> jdbc.update(
                        "insert into image_variant (image_id, size, content_type, data) values (?, 96, 'image/jpeg', ?)",
                        image,
                        new byte[] {1}))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                        "insert into image_variant (image_id, size, content_type, data) values (?, 100, 'image/jpeg', ?)",
                        image,
                        new byte[] {1}))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                        "insert into image_variant (image_id, size, content_type, data) values (?, 256, 'image/gif', ?)",
                        image,
                        new byte[] {1}))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                        "insert into image_variant (image_id, size, content_type, data) values (?, 256, 'image/jpeg', ?)",
                        UUID.randomUUID(),
                        new byte[] {1}))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void photoChangeAcceptsOnlyTheThreeEventsOrNull() {
        // vnosi sledi so nespremenljivi (FR-005-05): vrednost se preveri ob vstavljanju
        String sql = "insert into audit_entry (group_id, seq, actor_id, action, contact_count, contact_name,"
                + " photo_change) values (?, ?, ?, 'UPDATE', 1, 'X', ?)";
        int seq = 1;
        for (String value : new String[] {"ADDED", "REPLACED", "REMOVED", null}) {
            jdbc.update(sql, group, seq++, user, value);
        }

        assertThatThrownBy(() -> jdbc.update(sql, group, 10, user, "CHANGED"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Integer.class, group))
                .isEqualTo(4);
    }

    @Test
    void deletingTheUserDeletesTheirProfileImageWithVariantsButNotGroupImages() {
        long other = user + 0; // isti uporabnik je lastnik skupine
        insertImage("insert into image (kind, user_id) values ('USER', ?)", other);
        insertImage("insert into image (kind, group_id) values ('GROUP', ?)", group);
        UUID image = imageId("user_id = ?", other);
        jdbc.update(
                "insert into image_variant (image_id, size, content_type, data) values (?, 96, 'image/jpeg', ?)",
                image,
                new byte[] {1});
        jdbc.update("delete from group_member where user_id = ?", other);
        jdbc.update("update contact_group set updated_by = null where updated_by = ?", other);

        jdbc.update("delete from app_user where id = ?", other);

        assertThat(jdbc.queryForObject("select count(*) from image where user_id = ?", Integer.class, other))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from image_variant where image_id = ?", Integer.class, image))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from image where group_id = ?", Integer.class, group))
                .isEqualTo(1);
    }
}
