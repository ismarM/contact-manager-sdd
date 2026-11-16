package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * Zapisi tipiziranih atributov (016, FR-016-04, FR-016-26): stari posnetki sledi brez {@code type} in
 * {@code addressParts} se preberejo kot {@code OTHER} oziroma {@code null}; novi se zapišejo in preberejo brez izgube.
 */
@Tag("FR-016-04")
@Tag("FR-016-26")
class TypedRecordsTest {

    private final JsonMapper json = JsonMapper.builder().build();

    private static final String OLD_STATE = """
            {"firstName":"Ana","lastName":"Novak","address":"Cesta 1, Ljubljana","email":"ana@primer.si",
             "phone":"041 123 456","company":null,"country":"SI",
             "attributes":[{"key":"Mobilni","value":"040 111 222"},{"key":"Opomba","value":"Pozdravi"}],
             "tags":["vip"],"version":3,"createdAt":"2026-01-01T10:00:00Z","updatedAt":"2026-01-02T10:00:00Z",
             "updatedById":7}
            """;

    @Test
    void oldSnapshotsWithoutTypeReadAsOtherAndWithoutAddressParts() {
        ContactState state = json.readValue(OLD_STATE, ContactState.class);

        assertThat(state.addressParts()).isNull();
        assertThat(state.address()).isEqualTo("Cesta 1, Ljubljana");
        assertThat(state.attributes())
                .containsExactly(
                        new Attribute("Mobilni", AttributeType.OTHER, "040 111 222", null),
                        new Attribute("Opomba", AttributeType.OTHER, "Pozdravi", null));
        assertThat(state.version()).isEqualTo(3);
    }

    @Test
    void anOldSnapshotRoundTripsWithoutChangingValues() {
        ContactState state = json.readValue(OLD_STATE, ContactState.class);

        ContactState again = json.readValue(json.writeValueAsString(state), ContactState.class);

        assertThat(again).isEqualTo(state);
    }

    @Test
    void typedSnapshotsKeepTypeValueAndAddressPartsThroughJson() {
        Address parts = new Address("Cesta 1", null, "1000", "Ljubljana", null, "SI");
        ContactState state = new ContactState(
                "Ana",
                "Novak",
                null,
                parts,
                null,
                null,
                null,
                "SI",
                List.of(
                        new Attribute("Mobilni", AttributeType.PHONE, "+38640111222", null),
                        new Attribute("Dom", AttributeType.ADDRESS, null, parts)),
                List.of(),
                1,
                null,
                null,
                null);

        String text = json.writeValueAsString(state);
        ContactState read = json.readValue(text, ContactState.class);

        assertThat(read).isEqualTo(state);
        assertThat(text).contains("\"type\":\"PHONE\"").contains("\"postalCode\":\"1000\"");
        assertThat(text).doesNotContain("\"extra\"").doesNotContain("\"region\"");
    }

    @Test
    void attributeWithoutTypeDefaultsToOtherAndTheShortConstructorIsText() {
        assertThat(new Attribute("k", null, "v", null).type()).isEqualTo(AttributeType.OTHER);

        Attribute text = new Attribute("k", "v");

        assertThat(text.type()).isEqualTo(AttributeType.OTHER);
        assertThat(text.value()).isEqualTo("v");
        assertThat(text.parts()).isNull();
    }

    @Test
    void attributeJsonOmitsAbsentValueOrParts() {
        String text = json.writeValueAsString(new Attribute("k", AttributeType.URL, "https://primer.si", null));

        assertThat(text).isEqualTo("{\"key\":\"k\",\"type\":\"URL\",\"value\":\"https://primer.si\"}");
    }

    @Test
    void compatibilityConstructorsLeaveAddressPartsEmpty() {
        ContactInput input = new ContactInput("A", "B", "Naslov", null, null, null, null, List.of(), List.of());

        assertThat(input.addressParts()).isNull();
        assertThat(input.address()).isEqualTo("Naslov");
    }
}
