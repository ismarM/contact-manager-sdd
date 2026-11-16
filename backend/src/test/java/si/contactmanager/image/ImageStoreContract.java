package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.ProcessedImage.Variant;

/**
 * Pogodba shrambe slik (FR-018-19, research R-01): isti nabor testov mora prestati vsaka implementacija {@link
 * ImageStore} (PostgreSQL v {@code ImageStoreIT}, pomnilniška v {@code ImageStorePortabilityTest}); zamenjava
 * ponudnika tako ne spremeni vedenja API-ja.
 */
interface ImageStoreContract {

    ImageStore store();

    /** Nov, obstoječ lastnik vrste USER. */
    Owner newUser();

    /** Nova, obstoječa skupina. */
    UUID newGroup();

    /** Nov, obstoječ kontakt v skupini. */
    Owner newContact(UUID group);

    /** Kontakt je izbrisan (slika ostane, a ni dostopna). */
    void removeContact(Owner contact);

    /** Kontakt je obnovljen z istim id. */
    void restoreContact(Owner contact);

    /** Obdelana slika z danimi velikostmi; bajti vsake različice so razpoznavni ({@code size} ponovitev vrednosti). */
    static ProcessedImage image(int seed, int... sizes) {
        java.util.ArrayList<Variant> variants = new java.util.ArrayList<>();
        for (int size : sizes) {
            byte[] data = new byte[size / 8];
            java.util.Arrays.fill(data, (byte) (seed + size));
            variants.add(new Variant(size, size == 96 && seed < 0 ? "image/png" : "image/jpeg", data));
        }
        return new ProcessedImage(variants);
    }

    @Test
    default void putThenGetReturnsExactlyTheRequestedVariantWithRevisionOne() {
        Owner owner = newUser();

        long revision = store().put(owner, image(1, 512, 256, 96));

        assertThat(revision).isEqualTo(1);
        for (int size : new int[] {96, 256, 512}) {
            StoredImage stored = store().get(owner, size).orElseThrow();
            assertThat(stored.size()).isEqualTo(size);
            assertThat(stored.revision()).isEqualTo(1);
            assertThat(stored.contentType()).isEqualTo("image/jpeg");
            assertThat(stored.data()).hasSize(size / 8).containsOnly((byte) (1 + size));
        }
        assertThat(store().revision(owner)).contains(1L);
    }

    @Test
    default void getReturnsTheLargestVariantNotLargerThanRequested() {
        Owner owner = newUser();
        store().put(owner, image(1, 256, 96));

        assertThat(store().get(owner, 512).orElseThrow().size()).isEqualTo(256);
        assertThat(store().get(owner, 256).orElseThrow().size()).isEqualTo(256);
        assertThat(store().get(owner, 96).orElseThrow().size()).isEqualTo(96);
    }

    @Test
    default void pngVariantKeepsItsContentType() {
        Owner owner = newUser();

        store().put(owner, image(-1, 96));

        assertThat(store().get(owner, 96).orElseThrow().contentType()).isEqualTo("image/png");
    }

    @Test
    default void ownerWithoutAnImageHasNothing() {
        Owner owner = newUser();

        assertThat(store().get(owner, 256)).isEmpty();
        assertThat(store().revision(owner)).isEmpty();
        assertThat(store().delete(owner)).isFalse();
    }

    @Test
    default void replacementRaisesTheRevisionAndReplacesAllVariants() {
        Owner owner = newUser();
        store().put(owner, image(1, 512, 256, 96));

        long revision = store().put(owner, image(2, 256, 96));

        assertThat(revision).isEqualTo(2);
        assertThat(store().revision(owner)).contains(2L);
        StoredImage large = store().get(owner, 512).orElseThrow();
        assertThat(large.size()).as("stara različica 512 je izginila").isEqualTo(256);
        assertThat(large.data()).containsOnly((byte) (2 + 256));
        assertThat(large.revision()).isEqualTo(2);
    }

    @Test
    default void deleteRemovesTheImageAndIsReportedOnce() {
        Owner owner = newUser();
        store().put(owner, image(1, 96));

        assertThat(store().delete(owner)).isTrue();
        assertThat(store().delete(owner)).isFalse();
        assertThat(store().get(owner, 96)).isEmpty();
        assertThat(store().revision(owner)).isEmpty();
    }

    @Test
    default void ownersAreIndependentAndOnlyOneImagePerOwnerExists() {
        Owner first = newUser();
        Owner second = newUser();
        UUID group = newGroup();
        Owner groupOwner = Owner.group(group);
        Owner contact = newContact(group);
        store().put(first, image(1, 96));
        store().put(second, image(2, 96));
        store().put(groupOwner, image(3, 96));
        store().put(contact, image(4, 96));

        store().delete(first);
        store().put(second, image(5, 96));

        assertThat(store().get(first, 96)).isEmpty();
        assertThat(store().get(second, 96).orElseThrow().data()).containsOnly((byte) (5 + 96));
        assertThat(store().get(second, 96).orElseThrow().revision()).isEqualTo(2);
        assertThat(store().get(groupOwner, 96).orElseThrow().data()).containsOnly((byte) (3 + 96));
        assertThat(store().get(contact, 96).orElseThrow().data()).containsOnly((byte) (4 + 96));
    }

    @Test
    default void contactImageOfAnotherGroupIsNotReachableThroughThisGroup() {
        UUID mine = newGroup();
        UUID other = newGroup();
        Owner contact = newContact(mine);
        store().put(contact, image(1, 96));

        Owner sameIdInOtherGroup = Owner.contact(other, contact.contactId());

        assertThat(store().get(sameIdInOtherGroup, 96)).isEmpty();
        assertThat(store().revision(sameIdInOtherGroup)).isEmpty();
        assertThat(store().delete(sameIdInOtherGroup)).isFalse();
        assertThat(store().get(contact, 96)).isPresent();
    }

    @Test
    default void imageOfARemovedContactIsHiddenAndComesBackWithTheContact() {
        UUID group = newGroup();
        Owner contact = newContact(group);
        store().put(contact, image(1, 256, 96));

        removeContact(contact);
        assertThat(store().get(contact, 256)).isEmpty();
        assertThat(store().revision(contact)).isEmpty();
        assertThat(store().contactRevisions(group, List.of(contact.contactId())))
                .isEmpty();

        restoreContact(contact);
        assertThat(store().get(contact, 256).orElseThrow().data()).containsOnly((byte) (1 + 256));
        assertThat(store().revision(contact)).contains(1L);
    }

    @Test
    default void removedContactImageCanStillBeDeleted() {
        UUID group = newGroup();
        Owner contact = newContact(group);
        store().put(contact, image(1, 96));
        removeContact(contact);

        assertThat(store().delete(contact)).isTrue();

        restoreContact(contact);
        assertThat(store().get(contact, 96)).isEmpty();
    }

    @Test
    default void contactRevisionsListsOnlyContactsOfTheGroupWithAnImage() {
        UUID group = newGroup();
        UUID other = newGroup();
        Owner withImage = newContact(group);
        Owner replaced = newContact(group);
        Owner without = newContact(group);
        Owner foreign = newContact(other);
        store().put(withImage, image(1, 96));
        store().put(replaced, image(1, 96));
        store().put(replaced, image(2, 96));
        store().put(foreign, image(3, 96));

        Map<UUID, Long> revisions = store().contactRevisions(
                        group,
                        List.of(withImage.contactId(), replaced.contactId(), without.contactId(), foreign.contactId()));

        assertThat(revisions).containsOnlyKeys(withImage.contactId(), replaced.contactId());
        assertThat(revisions).containsEntry(withImage.contactId(), 1L).containsEntry(replaced.contactId(), 2L);
        assertThat(store().contactRevisions(group, List.of())).isEmpty();
    }

    @Test
    default void reassignMovesTheImageToTheOtherContact() {
        UUID group = newGroup();
        Owner from = newContact(group);
        Owner to = newContact(group);
        store().put(from, image(1, 96));

        store().reassign(from, to);

        assertThat(store().get(from, 96)).isEmpty();
        assertThat(store().get(to, 96).orElseThrow().data()).containsOnly((byte) (1 + 96));
    }

    @Test
    default void mergeKeepsTheSurvivorsOwnImageAndDeletesTheLosers() {
        UUID group = newGroup();
        Owner keeper = newContact(group);
        Owner first = newContact(group);
        Owner second = newContact(group);
        store().put(keeper, image(1, 96));
        store().put(first, image(2, 96));
        store().put(second, image(3, 96));

        store().mergeInto(group, keeper.contactId(), List.of(first.contactId(), second.contactId()));

        assertThat(store().get(keeper, 96).orElseThrow().data()).containsOnly((byte) (1 + 96));
        assertThat(store().get(first, 96)).isEmpty();
        assertThat(store().get(second, 96)).isEmpty();
    }

    @Test
    default void mergeWithoutASurvivorImageAdoptsTheFirstLosersImage() {
        UUID group = newGroup();
        Owner keeper = newContact(group);
        Owner first = newContact(group);
        Owner second = newContact(group);
        store().put(first, image(2, 96));
        store().put(second, image(3, 96));

        store().mergeInto(group, keeper.contactId(), List.of(first.contactId(), second.contactId()));

        assertThat(store().get(keeper, 96).orElseThrow().data()).containsOnly((byte) (2 + 96));
        assertThat(store().get(first, 96)).isEmpty();
        assertThat(store().get(second, 96)).isEmpty();
    }

    @Test
    default void mergeSkipsLosersWithoutAnImageWhenAdopting() {
        UUID group = newGroup();
        Owner keeper = newContact(group);
        Owner first = newContact(group);
        Owner second = newContact(group);
        store().put(second, image(3, 96));

        store().mergeInto(group, keeper.contactId(), List.of(first.contactId(), second.contactId()));

        assertThat(store().get(keeper, 96).orElseThrow().data()).containsOnly((byte) (3 + 96));
        assertThat(store().get(second, 96)).isEmpty();
    }

    @Test
    default void mergeWithoutAnyImageLeavesNothing() {
        UUID group = newGroup();
        Owner keeper = newContact(group);
        Owner loser = newContact(group);

        store().mergeInto(group, keeper.contactId(), List.of(loser.contactId()));

        assertThat(store().get(keeper, 96)).isEmpty();
        assertThat(store().get(loser, 96)).isEmpty();
    }
}
