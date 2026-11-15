package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/** Podjetje in država pri primerjavi, združevanju in rollbacku združitve (FR-013-06, FR-013-07). */
class MergeNewFieldsIT extends MergeApiTest {

    private Map<String, Object> contactWith(Scenario s, String company, String country) throws Exception {
        Map<String, Object> input = new java.util.LinkedHashMap<>(input("Janez", "Novak"));
        input.put("email", "janez@feri.si");
        input.put("company", company);
        input.put("country", country);
        return createViaApi(s, input);
    }

    @Test
    @Tag("FR-013-06")
    void compareReturnsTheNewFieldsOfEveryContact() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactWith(s, "Acme", "AT");
        Map<String, Object> b = contactWith(s, null, "DE");

        HttpResponse<String> response = compare(s.token(Who.EDITOR), s.group(), List.of(uuid(a), uuid(b)));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        List<Map<String, Object>> compared = asObjects(json(response.body()).get("contacts"));
        assertThat(compared).extracting(c -> c.get("company")).containsExactly("Acme", null);
        assertThat(compared).extracting(c -> c.get("country")).containsExactly("AT", "DE");
    }

    @Test
    @Tag("FR-013-06")
    @Tag("FR-013-07")
    void mergeStoresTheChosenValuesRecordsThemAndRollbackRestoresTheKeeperAndTheRemoved() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactWith(s, "Acme", "AT");
        Map<String, Object> b = contactWith(s, "Beta", "DE");
        UUID beforeMerge = audit.latestEntryId(s.group());
        Map<String, Object> result = simpleResult("Janez", "Novak", "janez@feri.si");
        result.put("company", "Beta");
        result.put("country", "AT");

        HttpResponse<String> merged =
                merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(List.of(uuid(a), uuid(b)), result));

        assertThat(merged.statusCode()).as(merged.body()).isEqualTo(200);
        UUID keeper = UUID.fromString((String) json(merged.body()).get("keptContactId"));
        assertThat(contacts.companyAndCountry(keeper))
                .containsEntry("company", "Beta")
                .containsEntry("country", "AT");
        assertThat(contacts.exists(keeper.equals(uuid(a)) ? uuid(b) : uuid(a))).isFalse();

        HttpResponse<String> rolledBack = rollback(s, Who.ADMIN, beforeMerge, audit.latestEntryId(s.group()));

        assertThat(rolledBack.statusCode()).as(rolledBack.body()).isEqualTo(201);
        assertThat(contacts.companyAndCountry(uuid(a)))
                .containsEntry("company", "Acme")
                .containsEntry("country", "AT");
        assertThat(contacts.companyAndCountry(uuid(b)))
                .containsEntry("company", "Beta")
                .containsEntry("country", "DE");
    }

    @Test
    @Tag("FR-013-06")
    void aMergeResultWithAnInvalidCountryIsRejectedAndNothingIsMerged() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = contactWith(s, "Acme", "AT");
        Map<String, Object> b = contactWith(s, "Beta", "DE");
        Map<String, Object> result = simpleResult("Janez", "Novak", "janez@feri.si");
        result.put("country", "Avstrija");

        HttpResponse<String> response =
                merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(List.of(uuid(a), uuid(b)), result));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("result.country", "INVALID_VALUE");
        UUID ua = uuid(a);
        assertThat(contacts.exists(ua)).isTrue();
        assertThat(contacts.exists(uuid(b))).isTrue();
        assertThat(contacts.companyAndCountry(ua)).containsEntry("country", "AT");
    }
}
