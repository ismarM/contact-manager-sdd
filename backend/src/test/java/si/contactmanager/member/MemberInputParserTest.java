package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.member.MemberInputParser.ParsedRole;
import si.contactmanager.member.MemberInputParser.ParsedTransfer;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Razčlenitev teles spremembe vloge in prenosa lastništva (FR-007-03, FR-007-09; research R-05, R-06). */
class MemberInputParserTest {

    private final MemberInputParser parser = new MemberInputParser();

    @Test
    @Tag("FR-007-03")
    void parsesRoleAndVersion() {
        ParsedRole parsed = parser.parseRole("{\"role\":\"ADMIN\",\"version\":3}");

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.role()).isEqualTo("ADMIN");
        assertThat(parsed.version()).isEqualTo(3L);
    }

    @Test
    @Tag("FR-007-03")
    void ownerIsAKnownRoleAndNotAParsingError() {
        // 403 za dodelitev OWNER odloči servis (research R-05), razčlenjevanje ga ne zavrne.
        ParsedRole parsed = parser.parseRole("{\"role\":\"OWNER\",\"version\":0}");

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.role()).isEqualTo("OWNER");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"version\":0}",
                "{\"role\":null,\"version\":0}",
            })
    @Tag("FR-007-03")
    void missingRoleIsRequired(String body) {
        assertThat(parser.parseRole(body).errors()).containsExactly(new FieldError("role", "REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"role\":\"SUPERUSER\",\"version\":0}",
                "{\"role\":5,\"version\":0}",
                "{\"role\":\"admin\",\"version\":0}",
            })
    @Tag("FR-007-03")
    void unknownRoleIsInvalid(String body) {
        assertThat(parser.parseRole(body).errors()).containsExactly(new FieldError("role", "INVALID_VALUE"));
    }

    @Test
    @Tag("FR-007-04")
    void missingVersionIsRequired() {
        assertThat(parser.parseRole("{\"role\":\"EDITOR\"}").errors())
                .containsExactly(new FieldError("version", "REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{\"role\":\"EDITOR\",\"version\":-1}",
                "{\"role\":\"EDITOR\",\"version\":1.5}",
                "{\"role\":\"EDITOR\",\"version\":\"3\"}",
            })
    @Tag("FR-007-04")
    void negativeFractionalOrNonNumericVersionIsInvalid(String body) {
        assertThat(parser.parseRole(body).errors()).containsExactly(new FieldError("version", "INVALID_VALUE"));
    }

    @Test
    @Tag("FR-007-03")
    void unknownFieldIsReported() {
        assertThat(parser.parseRole("{\"role\":\"EDITOR\",\"version\":0,\"extra\":1}")
                        .errors())
                .containsExactly(new FieldError("extra", "UNKNOWN_FIELD"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not json", "[]", "\"x\"", "null"})
    @Tag("FR-007-03")
    void malformedRoleBodyIsReportedAsBody(String body) {
        assertThat(parser.parseRole(body).errors()).containsExactly(new FieldError("body", "MALFORMED"));
    }

    @Test
    @Tag("FR-007-09")
    void parsesTheTransferTarget() {
        UUID target = UUID.randomUUID();

        ParsedTransfer parsed = parser.parseTransfer("{\"memberId\":\"" + target + "\"}");

        assertThat(parsed.errors()).isEmpty();
        assertThat(parsed.memberId()).isEqualTo(target);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"memberId\":null}"})
    @Tag("FR-007-09")
    void missingTransferTargetIsRequired(String body) {
        assertThat(parser.parseTransfer(body).errors()).containsExactly(new FieldError("memberId", "REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"memberId\":\"ni-uuid\"}", "{\"memberId\":5}", "{\"memberId\":\"\"}"})
    @Tag("FR-007-09")
    void nonUuidTransferTargetIsInvalid(String body) {
        assertThat(parser.parseTransfer(body).errors()).containsExactly(new FieldError("memberId", "INVALID_VALUE"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not json", "[]"})
    @Tag("FR-007-09")
    void malformedTransferBodyIsReportedAsBody(String body) {
        assertThat(parser.parseTransfer(body).errors()).containsExactly(new FieldError("body", "MALFORMED"));
    }
}
