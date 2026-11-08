package si.contactmanager.invitation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.invitation.InvitationInputParser.Parsed;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Razčlenitev telesa pošiljanja povabila (FR-006-03, research R-07). */
@Tag("FR-006-03")
class InvitationInputParserTest {

    private final InvitationInputParser parser = new InvitationInputParser();

    @Test
    void trimsTheEmailAndKeepsItsCase() {
        Parsed parsed = parser.parse("{\"email\":\" Ana@Primer.si \",\"role\":\"EDITOR\"}");

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.email()).isEqualTo("Ana@Primer.si");
        assertThat(parsed.role()).isEqualTo("EDITOR");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"role\":\"EDITOR\"}",
                "{\"email\":\"\",\"role\":\"EDITOR\"}",
                "{\"email\":\"   \",\"role\":\"EDITOR\"}"
            })
    void missingEmptyOrBlankEmailIsRequired(String body) {
        assertThat(parser.parse(body).errors()).containsExactly(new FieldError("email", "REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ana@", "ana primer.si", "@primer.si", "ana@primer"})
    void malformedEmailIsInvalid(String email) {
        assertThat(parser.parse("{\"email\":\"" + email + "\",\"role\":\"VIEWER\"}")
                        .errors())
                .containsExactly(new FieldError("email", "INVALID_VALUE"));
    }

    @Test
    void emailOf255CharactersIsTooLongAnd254IsValid() {
        String local = "a".repeat(254 - "@p.si".length());
        String ok = local + "@p.si";
        String tooLong = "a" + ok;

        assertThat(ok).hasSize(254);
        assertThat(parser.parse("{\"email\":\"" + ok + "\",\"role\":\"VIEWER\"}")
                        .errors())
                .isEmpty();
        assertThat(parser.parse("{\"email\":\"" + tooLong + "\",\"role\":\"VIEWER\"}")
                        .errors())
                .containsExactly(new FieldError("email", "TOO_LONG"));
    }

    @Test
    void missingRoleIsRequired() {
        assertThat(parser.parse("{\"email\":\"ana@primer.si\"}").errors())
                .containsExactly(new FieldError("role", "REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"SUPERUSER\"", "5", "\"editor\""})
    void unknownRoleIsInvalid(String role) {
        assertThat(parser.parse("{\"email\":\"ana@primer.si\",\"role\":" + role + "}")
                        .errors())
                .containsExactly(new FieldError("role", "INVALID_VALUE"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"OWNER", "ADMIN"})
    void ownerAndAdminAreKnownRolesDecidedByTheService(String role) {
        Parsed parsed = parser.parse("{\"email\":\"ana@primer.si\",\"role\":\"" + role + "\"}");

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.role()).isEqualTo(role);
    }

    @Test
    void unknownFieldIsReported() {
        assertThat(parser.parse("{\"email\":\"ana@primer.si\",\"role\":\"VIEWER\",\"extra\":1}")
                        .errors())
                .containsExactly(new FieldError("extra", "UNKNOWN_FIELD"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "", "[]", "\"text\"", "null"})
    void invalidJsonOrEmptyBodyIsMalformed(String body) {
        assertThat(parser.parse(body).errors()).containsExactly(new FieldError("body", "MALFORMED"));
    }

    @Test
    void errorsOfBothFieldsAreCollected() {
        assertThat(parser.parse("{\"email\":\"ana@\"}").errors())
                .containsExactlyInAnyOrder(
                        new FieldError("email", "INVALID_VALUE"), new FieldError("role", "REQUIRED"));
    }
}
