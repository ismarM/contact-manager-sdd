package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.BulkEditInput.AttributeSet;
import si.contactmanager.contact.BulkEditInput.Field;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Čista funkcija množičnega urejanja (FR-009-07, FR-009-08, FR-009-09; research R-04, data-model.md – BulkEdit):
 * vrstni red »odstrani → dodaj → atributi«, primerjava ne glede na velikost črk, {@code changed} po vsebini.
 */
class BulkEditTest {

    private static final Instant T = Instant.parse("2026-10-12T12:30:00Z");

    private static ContactState contact(List<String> tags, List<Attribute> attributes) {
        return new ContactState("Janez", "Novak", null, null, null, attributes, tags, 3, T, T, null);
    }

    private static ContactState withTags(String... tags) {
        return contact(List.of(tags), List.of());
    }

    private static ContactState withAttributes(Attribute... attributes) {
        return contact(List.of(), List.of(attributes));
    }

    private static BulkEditInput edit(List<String> add, List<String> remove, List<AttributeSet> attributes) {
        return new BulkEditInput(List.of(UUID.randomUUID()), add, remove, attributes);
    }

    private static BulkEditInput addTags(String... tags) {
        return edit(List.of(tags), List.of(), List.of());
    }

    private static BulkEditInput removeTags(String... tags) {
        return edit(List.of(), List.of(tags), List.of());
    }

    private static BulkEditInput set(AttributeSet... attributes) {
        return edit(List.of(), List.of(), List.of(attributes));
    }

    @Test
    @Tag("FR-009-08")
    void addingATagTheContactAlreadyHasInAnotherCaseChangesNothing() {
        ContactState before = withTags("VIP");

        ContactState after = BulkEdit.apply(before, addTags("vip"));

        assertThat(after.tags()).containsExactly("VIP");
        assertThat(BulkEdit.changed(before, after)).isFalse();
    }

    @Test
    @Tag("FR-009-08")
    void aNewTagGoesToTheEndInTheSpellingOfTheRequest() {
        ContactState after = BulkEdit.apply(withTags("a", "c"), addTags("Konferenca2025"));

        assertThat(after.tags()).containsExactly("a", "c", "Konferenca2025");
        assertThat(BulkEdit.changed(withTags("a", "c"), after)).isTrue();
    }

    @Test
    @Tag("FR-009-08")
    void removingATagTheContactDoesNotHaveIsNotAChange() {
        ContactState before = withTags("a", "b");

        ContactState after = BulkEdit.apply(before, removeTags("staro"));

        assertThat(after.tags()).containsExactly("a", "b");
        assertThat(BulkEdit.changed(before, after)).isFalse();
    }

    @Test
    @Tag("FR-009-08")
    void removalMatchesIgnoringCaseAndKeepsTheOthersInOrder() {
        ContactState after = BulkEdit.apply(withTags("a", "VIP", "c"), removeTags("vip"));

        assertThat(after.tags()).containsExactly("a", "c");
    }

    @Test
    @Tag("FR-009-08")
    void removeIsAppliedBeforeAdd() {
        ContactState after = BulkEdit.apply(withTags("a", "c"), edit(List.of("b"), List.of("a"), List.of()));

        assertThat(after.tags()).containsExactly("c", "b");
    }

    @Test
    @Tag("FR-009-08")
    @Tag("FR-009-09")
    void aContactWithThirtyTagsCanSwapOneBecauseRemovalComesFirst() {
        List<String> thirty =
                IntStream.rangeClosed(1, 30).mapToObj(i -> "t" + i).toList();
        ContactState before = contact(thirty, List.of());

        ContactState after = BulkEdit.apply(before, edit(List.of("nova"), List.of("t1"), List.of()));

        assertThat(after.tags()).hasSize(30).contains("nova").doesNotContain("t1");
        assertThat(BulkEdit.violations(after)).isEmpty();
    }

    @Test
    @Tag("FR-009-07")
    void anExistingCustomKeyGetsTheNewValueAndTheSpellingOfTheRequestAtTheSamePosition() {
        ContactState before = withAttributes(
                new Attribute("Oddelek", "IT"),
                new Attribute("Podjetje", "stari d.o.o."),
                new Attribute("Mesto", "MB"));

        ContactState after = BulkEdit.apply(before, set(new AttributeSet(Field.CUSTOM, "podjetje", "FERI")));

        assertThat(after.attributes())
                .containsExactly(
                        new Attribute("Oddelek", "IT"),
                        new Attribute("podjetje", "FERI"),
                        new Attribute("Mesto", "MB"));
    }

    @Test
    @Tag("FR-009-07")
    void aNewCustomKeyGoesToTheEnd() {
        ContactState before = withAttributes(new Attribute("Oddelek", "IT"));

        ContactState after = BulkEdit.apply(before, set(new AttributeSet(Field.CUSTOM, "podjetje", "FERI")));

        assertThat(after.attributes())
                .containsExactly(new Attribute("Oddelek", "IT"), new Attribute("podjetje", "FERI"));
    }

    @Test
    @Tag("FR-009-07")
    void anEmptyValueRemovesTheCustomAttributeAndClosesTheGap() {
        ContactState before =
                withAttributes(new Attribute("a", "1"), new Attribute("Podjetje", "x"), new Attribute("c", "3"));

        ContactState after = BulkEdit.apply(before, set(new AttributeSet(Field.CUSTOM, "podjetje", "")));

        assertThat(after.attributes()).containsExactly(new Attribute("a", "1"), new Attribute("c", "3"));
    }

    @Test
    @Tag("FR-009-07")
    void anEmptyValueForAMissingCustomAttributeIsNotAChange() {
        ContactState before = withAttributes(new Attribute("a", "1"));

        ContactState after = BulkEdit.apply(before, set(new AttributeSet(Field.CUSTOM, "podjetje", "")));

        assertThat(after.attributes()).containsExactly(new Attribute("a", "1"));
        assertThat(BulkEdit.changed(before, after)).isFalse();
    }

    @Test
    @Tag("FR-009-07")
    void predefinedFieldsAreSetByANonEmptyValueAndEmptiedByAnEmptyOne() {
        ContactState before = new ContactState(
                "Janez", "Novak", "Stara 1", "star@primer.si", "01 111", List.of(), List.of(), 0, T, T, null);

        ContactState set = BulkEdit.apply(
                before,
                set(
                        new AttributeSet(Field.ADDRESS, null, "Nova 2"),
                        new AttributeSet(Field.EMAIL, null, "nov@primer.si"),
                        new AttributeSet(Field.PHONE, null, "02 222")));
        ContactState cleared = BulkEdit.apply(
                before,
                set(
                        new AttributeSet(Field.ADDRESS, null, ""),
                        new AttributeSet(Field.EMAIL, null, ""),
                        new AttributeSet(Field.PHONE, null, "")));

        assertThat(set.address()).isEqualTo("Nova 2");
        assertThat(set.email()).isEqualTo("nov@primer.si");
        assertThat(set.phone()).isEqualTo("02 222");
        assertThat(set.firstName()).isEqualTo("Janez");
        assertThat(set.lastName()).isEqualTo("Novak");
        assertThat(cleared.address()).isNull();
        assertThat(cleared.email()).isNull();
        assertThat(cleared.phone()).isNull();
        assertThat(BulkEdit.changed(before, set)).isTrue();
        assertThat(BulkEdit.changed(before, cleared)).isTrue();
    }

    @Test
    @Tag("FR-009-07")
    void settingTheSameValueIsNotAChange() {
        ContactState before =
                new ContactState("Janez", "Novak", null, null, "01 111", List.of(), List.of(), 0, T, T, null);

        ContactState after = BulkEdit.apply(before, set(new AttributeSet(Field.PHONE, null, "01 111")));

        assertThat(BulkEdit.changed(before, after)).isFalse();
    }

    @Test
    @Tag("FR-009-16")
    void metadataDoesNotCountAsAChange() {
        ContactState before = withTags("a");
        ContactState other = new ContactState(
                "Janez",
                "Novak",
                null,
                null,
                null,
                List.of(),
                List.of("a"),
                9,
                T.plusSeconds(60),
                T.plusSeconds(90),
                5L);

        assertThat(BulkEdit.changed(before, other)).isFalse();
    }

    @Test
    @Tag("FR-009-08")
    void aDifferentTagOrderIsAChange() {
        assertThat(BulkEdit.changed(withTags("a", "b"), withTags("b", "a"))).isTrue();
    }

    @Test
    @Tag("FR-009-09")
    void thirtyOneTagsInTheFinalStateIsAPerContactErrorButThirtyIsNot() {
        List<String> thirty =
                IntStream.rangeClosed(1, 30).mapToObj(i -> "t" + i).toList();
        ContactState full = contact(thirty, List.of());

        ContactState tooMany = BulkEdit.apply(full, addTags("nova"));

        assertThat(tooMany.tags()).hasSize(31);
        assertThat(BulkEdit.violations(tooMany)).containsExactly(new FieldError("tags", "TOO_MANY"));
        assertThat(BulkEdit.violations(full)).isEmpty();
    }

    @Test
    @Tag("FR-009-09")
    void fiftyOneAttributesInTheFinalStateIsAPerContactErrorButFiftyIsNot() {
        List<Attribute> fifty = new ArrayList<>();
        IntStream.rangeClosed(1, 50).forEach(i -> fifty.add(new Attribute("k" + i, "v")));
        ContactState full = contact(List.of(), fifty);

        ContactState tooMany = BulkEdit.apply(full, set(new AttributeSet(Field.CUSTOM, "nov", "x")));

        assertThat(tooMany.attributes()).hasSize(51);
        assertThat(BulkEdit.violations(tooMany)).containsExactly(new FieldError("attributes", "TOO_MANY"));
        assertThat(BulkEdit.violations(full)).isEmpty();
        assertThat(BulkEdit.violations(BulkEdit.apply(full, set(new AttributeSet(Field.CUSTOM, "k7", "drugo")))))
                .isEmpty();
    }
}
