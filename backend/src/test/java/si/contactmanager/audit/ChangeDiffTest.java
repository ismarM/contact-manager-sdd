package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static si.contactmanager.audit.ChangeField.Field.ADDRESS;
import static si.contactmanager.audit.ChangeField.Field.ATTRIBUTE;
import static si.contactmanager.audit.ChangeField.Field.EMAIL;
import static si.contactmanager.audit.ChangeField.Field.FIRST_NAME;
import static si.contactmanager.audit.ChangeField.Field.LAST_NAME;
import static si.contactmanager.audit.ChangeField.Field.PHONE;
import static si.contactmanager.audit.ChangeField.Field.TAGS;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.ContactState;

/** Izpeljava spremenjenih polj iz stanj prej/potem (FR-005-02, FR-005-08; research R-03). */
@Tag("FR-005-02")
@Tag("FR-005-08")
class ChangeDiffTest {

    private static final Instant T1 = Instant.parse("2026-10-12T12:30:00Z");
    private static final Instant T2 = Instant.parse("2026-10-12T12:32:00Z");

    private static ContactState janez() {
        return new ContactState(
                "Janez",
                "Novak",
                null,
                "janez@primer.si",
                "01 234 567",
                List.of(new Attribute("kompetenca", "web dev")),
                List.of("vip", "konferenca2025"),
                3,
                T1,
                T1,
                17L);
    }

    private static ContactState with(
            ContactState base, String phone, List<Attribute> attributes, List<String> tags, long version) {
        return new ContactState(
                base.firstName(),
                base.lastName(),
                base.address(),
                base.email(),
                phone,
                attributes,
                tags,
                version,
                base.createdAt(),
                T2,
                99L);
    }

    @Test
    void addedContactListsEveryFilledFieldWithAnEmptyBefore() {
        List<ChangeField> fields = ChangeDiff.fields(null, janez());

        assertThat(fields)
                .extracting(ChangeField::field, ChangeField::key, ChangeField::before, ChangeField::after)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(FIRST_NAME, null, null, "Janez"),
                        org.assertj.core.groups.Tuple.tuple(LAST_NAME, null, null, "Novak"),
                        org.assertj.core.groups.Tuple.tuple(EMAIL, null, null, "janez@primer.si"),
                        org.assertj.core.groups.Tuple.tuple(PHONE, null, null, "01 234 567"),
                        org.assertj.core.groups.Tuple.tuple(ATTRIBUTE, "kompetenca", null, "web dev"),
                        org.assertj.core.groups.Tuple.tuple(TAGS, null, null, List.of("vip", "konferenca2025")));
        assertThat(fields).extracting(ChangeField::field).doesNotContain(ADDRESS);
    }

    @Test
    void removedContactListsEveryFilledFieldWithAnEmptyAfter() {
        List<ChangeField> fields = ChangeDiff.fields(janez(), null);

        assertThat(fields)
                .extracting(ChangeField::field, ChangeField::key, ChangeField::before, ChangeField::after)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(FIRST_NAME, null, "Janez", null),
                        org.assertj.core.groups.Tuple.tuple(LAST_NAME, null, "Novak", null),
                        org.assertj.core.groups.Tuple.tuple(EMAIL, null, "janez@primer.si", null),
                        org.assertj.core.groups.Tuple.tuple(PHONE, null, "01 234 567", null),
                        org.assertj.core.groups.Tuple.tuple(ATTRIBUTE, "kompetenca", "web dev", null),
                        org.assertj.core.groups.Tuple.tuple(TAGS, null, List.of("vip", "konferenca2025"), null));
    }

    @Test
    void changedPhoneIsTheOnlyField() {
        ContactState after = with(janez(), "031 111 222", janez().attributes(), janez().tags(), 4);

        assertThat(ChangeDiff.fields(janez(), after))
                .containsExactly(new ChangeField(PHONE, null, "01 234 567", "031 111 222"));
    }

    @Test
    void addedAttributeHasAnEmptyBefore() {
        ContactState after = with(
                janez(),
                janez().phone(),
                List.of(new Attribute("kompetenca", "web dev"), new Attribute("Oddelek", "IT")),
                janez().tags(),
                4);

        assertThat(ChangeDiff.fields(janez(), after))
                .containsExactly(new ChangeField(ATTRIBUTE, "Oddelek", null, "IT"));
    }

    @Test
    void changedAttributeValueKeepsTheKey() {
        ContactState after =
                with(janez(), janez().phone(), List.of(new Attribute("kompetenca", "java")), janez().tags(), 4);

        assertThat(ChangeDiff.fields(janez(), after))
                .containsExactly(new ChangeField(ATTRIBUTE, "kompetenca", "web dev", "java"));
    }

    @Test
    void removedTagListsTheTagsBeforeAndAfter() {
        ContactState after = with(janez(), janez().phone(), janez().attributes(), List.of("konferenca2025"), 4);

        assertThat(ChangeDiff.fields(janez(), after))
                .containsExactly(
                        new ChangeField(TAGS, null, List.of("vip", "konferenca2025"), List.of("konferenca2025")));
    }

    @Test
    void removingAllTagsGivesAnEmptyAfterList() {
        ContactState after = with(janez(), janez().phone(), janez().attributes(), List.of(), 4);

        assertThat(ChangeDiff.fields(janez(), after))
                .containsExactly(new ChangeField(TAGS, null, List.of("vip", "konferenca2025"), List.of()));
    }

    @Test
    void reorderingOnlyTheTagsStillListsTheTags() {
        ContactState after = with(janez(), janez().phone(), janez().attributes(), List.of("konferenca2025", "vip"), 4);

        assertThat(ChangeDiff.fields(janez(), after))
                .containsExactly(new ChangeField(
                        TAGS, null, List.of("vip", "konferenca2025"), List.of("konferenca2025", "vip")));
    }

    @Test
    void attributeKeyChangedOnlyInCaseIsARemovalOfTheOldKeyAndAnAdditionOfTheNewKey() {
        ContactState before =
                with(janez(), janez().phone(), List.of(new Attribute("Kompetenca", "web dev")), List.of(), 3);
        ContactState after =
                with(janez(), janez().phone(), List.of(new Attribute("kompetenca", "web dev")), List.of(), 4);

        assertThat(ChangeDiff.fields(before, after))
                .containsExactly(
                        new ChangeField(ATTRIBUTE, "Kompetenca", "web dev", null),
                        new ChangeField(ATTRIBUTE, "kompetenca", null, "web dev"));
    }

    @Test
    void metadataIsNotAField() {
        ContactState after = new ContactState(
                "Janez",
                "Novak",
                null,
                "janez@primer.si",
                "01 234 567",
                janez().attributes(),
                janez().tags(),
                9,
                T2,
                T2,
                null);

        assertThat(ChangeDiff.fields(janez(), after)).isEmpty();
    }

    @Test
    void fieldsComeInTheFixedOrderWithAttributesKeyedByBeforeThenNewKeys() {
        ContactState before = new ContactState(
                "Janez",
                "Novak",
                "Cesta 1",
                "janez@primer.si",
                "01 234 567",
                List.of(new Attribute("b", "1"), new Attribute("a", "2")),
                List.of("x"),
                1,
                T1,
                T1,
                17L);
        ContactState after = new ContactState(
                "Jan",
                "Novakovič",
                "Cesta 2",
                "jan@primer.si",
                "031 000 000",
                List.of(new Attribute("c", "3"), new Attribute("a", "9")),
                List.of("y"),
                2,
                T1,
                T2,
                17L);

        assertThat(ChangeDiff.fields(before, after))
                .extracting(ChangeField::field, ChangeField::key)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(FIRST_NAME, null),
                        org.assertj.core.groups.Tuple.tuple(LAST_NAME, null),
                        org.assertj.core.groups.Tuple.tuple(ADDRESS, null),
                        org.assertj.core.groups.Tuple.tuple(EMAIL, null),
                        org.assertj.core.groups.Tuple.tuple(PHONE, null),
                        org.assertj.core.groups.Tuple.tuple(ATTRIBUTE, "b"),
                        org.assertj.core.groups.Tuple.tuple(ATTRIBUTE, "a"),
                        org.assertj.core.groups.Tuple.tuple(ATTRIBUTE, "c"),
                        org.assertj.core.groups.Tuple.tuple(TAGS, null));
    }

    @Test
    void equalStatesHaveNoFields() {
        assertThat(ChangeDiff.fields(janez(), janez())).isEmpty();
    }
}
