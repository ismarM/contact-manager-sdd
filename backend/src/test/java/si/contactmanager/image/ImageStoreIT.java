package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import si.contactmanager.contact.support.ContactFixtures;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;

/**
 * Shramba slik v PostgreSQL (FR-018-12, FR-018-19; data-model.md): pogodbeni testi ({@link ImageStoreContract}) na pravi
 * bazi in posebnosti: ena slika na lastnika tudi pri sočasnih zamenjavah, različice se berejo samo po potrebi, sprožilca
 * odklopita in priklopita sliko kontakta.
 */
@Tag("FR-018-19")
@Tag("FR-018-12")
class ImageStoreIT extends ApiTest implements ImageStoreContract {

    @Autowired
    ImageStore store;

    private GroupFixtures groups;
    private ContactFixtures contacts;
    private long ownerId;

    @BeforeEach
    void fixtures() throws Exception {
        groups = new GroupFixtures(jdbc);
        contacts = new ContactFixtures(jdbc);
        ownerId = groups.userId(registeredUser("Lastnik slik").uid());
    }

    @Override
    public ImageStore store() {
        return store;
    }

    @Override
    public Owner newUser() {
        try {
            return Owner.user(groups.userId(registeredUser("Uporabnik").uid()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public UUID newGroup() {
        return groups.createGroup(ownerId, "Skupina slik");
    }

    @Override
    public Owner newContact(UUID group) {
        return Owner.contact(group, contacts.insert(group, ownerId, "Janez", "Novak"));
    }

    @Override
    public void removeContact(Owner contact) {
        jdbc.update("delete from contact where id = ?", contact.contactId());
    }

    @Override
    public void restoreContact(Owner contact) {
        jdbc.update(
                "insert into contact (id, group_id, first_name, sort_first, updated_by) values (?, ?, 'Janez',"
                        + " 'janez', ?)",
                contact.contactId(),
                contact.groupId(),
                ownerId);
    }

    @Test
    void concurrentReplacementsKeepExactlyOneImageWithConsistentVariants() throws Exception {
        Owner owner = newUser();
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            List<Callable<Long>> calls = java.util.stream.IntStream.range(0, 6)
                    .<Callable<Long>>mapToObj(i -> () -> store.put(owner, ImageStoreContract.image(i, 256, 96)))
                    .toList();
            for (var future : pool.invokeAll(calls)) {
                future.get();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(store.revision(owner)).contains(6L);
        assertThat(jdbc.queryForObject(
                        "select count(*) from image where kind = 'USER' and user_id = ?",
                        Integer.class,
                        owner.userId()))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "select count(*) from image_variant v join image i on i.id = v.image_id where i.user_id = ?",
                        Integer.class,
                        owner.userId()))
                .isEqualTo(2);
        // različici 256 in 96 pripadata isti zadnji zamenjavi
        byte large = store.get(owner, 256).orElseThrow().data()[0];
        byte small = store.get(owner, 96).orElseThrow().data()[0];
        assertThat((byte) (large - 256)).isEqualTo((byte) (small - 96));
    }

    @Test
    void readingOneVariantNeverSelectsTheOthers() throws Exception {
        Owner owner = newUser();
        store.put(owner, ImageStoreContract.image(1, 512, 256, 96));

        // 96 je shranjena kot majhna vrednost: vrnjena sta samo njena vsebina in velikost
        StoredImage small = store.get(owner, 96).orElseThrow();

        assertThat(small.data()).hasSize(96 / 8);
        assertThat(small.size()).isEqualTo(96);
    }

    @Test
    void groupsContactsAndUsersCascadeFromTheirOwners() throws Exception {
        UUID group = newGroup();
        Owner contact = newContact(group);
        store.put(Owner.group(group), ImageStoreContract.image(1, 96));
        store.put(contact, ImageStoreContract.image(2, 96));
        removeContact(contact);

        jdbc.update("delete from contact_group where id = ?", group);

        assertThat(jdbc.queryForObject("select count(*) from image where group_id = ?", Integer.class, group))
                .isZero();
        assertThat(jdbc.queryForObject(
                        "select count(*) from image_variant v where not exists"
                                + " (select 1 from image i where i.id = v.image_id)",
                        Integer.class))
                .isZero();
    }
}
