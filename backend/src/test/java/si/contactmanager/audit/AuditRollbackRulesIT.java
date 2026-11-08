package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.audit.support.AuditApiTest;

/** Pravila rollbacka (FR-005-15, -17, -20): brez sprememb, veljavnost telesa, vrstni red preverjanj, arhivirana skupina. */
class AuditRollbackRulesIT extends AuditApiTest {

    private Map<String, Object> contactValues(Map<String, Object> detail, String phone) {
        Map<String, Object> values = valuesOf(detail);
        values.put("phone", phone);
        return values;
    }

    /** Dva vnosa (dodajanje, urejanje) kontakta Ana; vrne razčlenjen kontakt. */
    private Map<String, Object> twoEntries(Scenario s) throws Exception {
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        return a;
    }

    private void assertNothingChanged(Scenario s, int entries, Map<String, Object> contactRow, UUID contact) {
        assertThat(audit.count(s.group())).isEqualTo(entries);
        assertThat(contacts.row(contact)).isEqualTo(contactRow);
    }

    @Test
    @Tag("FR-005-15")
    void rollbackToTheNewestEntryWouldChangeNothing() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID newest = audit.latestEntryId(s.group());
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> response = rollback(s, Who.ADMIN, newest, newest);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "ROLLBACK_NO_CHANGES");
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @Test
    @Tag("FR-005-15")
    void rollbackToAPointAfterWhichTheChangesWereUndoneWouldChangeNothing() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID created = audit.latestEntryId(s.group());
        Map<String, Object> second = update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        update(s, Who.EDITOR, idOf(a), contactValues(second, "01 111 111"), versionOf(second));
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> response = rollback(s, Who.ADMIN, created, audit.latestEntryId(s.group()));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "ROLLBACK_NO_CHANGES");
        assertNothingChanged(s, 3, row, idOf(a));
    }

    @Test
    @Tag("FR-005-20")
    void rollbackToTheInitialStateOfAnEmptyTrailWouldChangeNothing() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> withoutLatest = rollbackInitial(s, Who.ADMIN, null);
        HttpResponse<String> response = rollbackInitial(s, Who.ADMIN, UUID.randomUUID());

        // Telo mora biti veljavno (400); prazna sled nima česa povrniti: 409 ROLLBACK_NO_CHANGES
        // (contracts/openapi.yaml).
        assertThat(withoutLatest.statusCode()).isEqualTo(400);
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "ROLLBACK_NO_CHANGES");
        assertThat(audit.count(s.group())).isZero();
    }

    @ParameterizedTest(name = "telo {0}")
    @ValueSource(strings = {"{}", "{\"latestEntryId\":null}", "{\"latestEntryId\":\"abc\"}", "{\"latestEntryId\":5}"})
    @Tag("FR-005-15")
    void aMissingOrInvalidLatestEntryIdIsAValidationError(String payload) throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> response = post(rollbackPath(s.group(), target), s.token(Who.ADMIN), payload);

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        assertThat(fieldErrors(response.body())).containsKey("latestEntryId");
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @Test
    @Tag("FR-005-15")
    void aMalformedJsonBodyIsAValidationErrorOnTheBodyField() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> response = post(rollbackPath(s.group(), target), s.token(Who.ADMIN), "{pokvarjen");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("body", "MALFORMED");
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @Test
    @Tag("FR-005-17")
    void theOrderOfChecksIsForbiddenNotFoundArchivedThenValidation() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID other = groups.createGroup(s.id(Who.OWNER), "Skupina B");
        post(contactsPath(other), s.token(Who.OWNER), body(contactInput("Tuj", "Kontakt", "01 999 999")));
        UUID foreign = (UUID) audit.entries(other).get(0).get("id");
        Map<String, Object> row = contacts.row(idOf(a));
        String invalid = "{\"latestEntryId\":\"abc\"}";

        // Bralec z neveljavnim telesom: 403 (vloga pred telesom).
        assertThat(post(rollbackPath(s.group(), target), s.token(Who.VIEWER), invalid)
                        .statusCode())
                .isEqualTo(403);
        // Tuj vnos z neveljavnim telesom: 404 (obstoj pred vlogo).
        HttpResponse<String> foreignEntry = post(rollbackPath(s.group(), foreign), s.token(Who.ADMIN), invalid);
        assertThat(foreignEntry.statusCode()).isEqualTo(404);
        assertThat(foreignEntry.body()).isEmpty();
        groups.archive(s.group());
        // Arhivirana skupina z neveljavnim telesom (admin): 409 GROUP_ARCHIVED (arhiviranost pred telesom).
        HttpResponse<String> archived = post(rollbackPath(s.group(), target), s.token(Who.ADMIN), invalid);
        assertThat(archived.statusCode()).isEqualTo(409);
        assertThat(json(archived.body())).containsEntry("code", "GROUP_ARCHIVED");
        assertNothingChanged(s, 2, row, idOf(a));
    }

    static Stream<Arguments> archivedRoles() {
        return Stream.of(
                Arguments.of(Who.OWNER, 409, "GROUP_ARCHIVED"),
                Arguments.of(Who.ADMIN, 409, "GROUP_ARCHIVED"),
                Arguments.of(Who.EDITOR, 403, "FORBIDDEN"),
                Arguments.of(Who.VIEWER, 403, "FORBIDDEN"));
    }

    /** Trajno arhivirana skupina nima lastnika (012), zato vrstice OWNER ni. */
    static Stream<Arguments> permanentlyArchivedRoles() {
        return archivedRoles().filter(arguments -> arguments.get()[0] != Who.OWNER);
    }

    @ParameterizedTest(name = "arhivirana skupina, {0}")
    @MethodSource("archivedRoles")
    @Tag("FR-005-17")
    void rollbackInAnArchivedGroupIsRejected(Who who, int status, String code) throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID latest = audit.latestEntryId(s.group());
        groups.archive(s.group());
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> onEntry = rollback(s, who, target, latest);
        HttpResponse<String> onInitial = rollbackInitial(s, who, latest);

        assertThat(onEntry.statusCode()).isEqualTo(status);
        assertThat(json(onEntry.body())).containsEntry("code", code);
        assertThat(onInitial.statusCode()).isEqualTo(status);
        assertThat(json(onInitial.body())).containsEntry("code", code);
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @ParameterizedTest(name = "trajno arhivirana skupina, {0}")
    @MethodSource("permanentlyArchivedRoles")
    @Tag("FR-005-17")
    void rollbackInAPermanentlyArchivedGroupIsRejected(Who who, int status, String code) throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID latest = audit.latestEntryId(s.group());
        groups.archive(s.group());
        groups.makePermanentlyArchived(s.group());
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> response = rollback(s, who, target, latest);

        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(json(response.body())).containsEntry("code", code);
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @Test
    @Tag("FR-005-17")
    void editorsAndViewersCannotRollBackInAnActiveGroup() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID latest = audit.latestEntryId(s.group());
        Map<String, Object> row = contacts.row(idOf(a));

        for (Who who : List.of(Who.EDITOR, Who.VIEWER)) {
            HttpResponse<String> response = rollback(s, who, target, latest);

            assertThat(response.statusCode()).as(who.name()).isEqualTo(403);
            assertThat(json(response.body())).containsEntry("code", "FORBIDDEN");
        }
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @Test
    @Tag("FR-005-17")
    void aWellFormedButNonExistentEntryIsNotFoundForRollback() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> response = rollback(s, Who.ADMIN, UUID.randomUUID(), audit.latestEntryId(s.group()));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertNothingChanged(s, 2, row, idOf(a));
    }

    @Test
    @Tag("FR-005-14")
    void validationComesBeforeVersionConflictAndConflictBeforeNoChanges() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = twoEntries(s);
        UUID target = (UUID) audit.entries(s.group()).get(0).get("id");
        UUID newest = audit.latestEntryId(s.group());
        Map<String, Object> row = contacts.row(idOf(a));

        HttpResponse<String> invalid =
                post(rollbackPath(s.group(), target), s.token(Who.ADMIN), "{\"latestEntryId\":\"abc\"}");
        HttpResponse<String> stale = rollback(s, Who.ADMIN, target, UUID.randomUUID());
        HttpResponse<String> noChanges = rollback(s, Who.ADMIN, newest, newest);

        assertThat(invalid.statusCode()).isEqualTo(400);
        assertThat(stale.statusCode()).isEqualTo(409);
        assertThat(json(stale.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(noChanges.statusCode()).isEqualTo(409);
        assertThat(json(noChanges.body())).containsEntry("code", "ROLLBACK_NO_CHANGES");
        assertNothingChanged(s, 2, row, idOf(a));
    }
}
