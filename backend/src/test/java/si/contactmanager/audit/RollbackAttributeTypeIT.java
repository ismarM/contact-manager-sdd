package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.TypedAuditApiTest;

/**
 * Rollback skupine in tipi ključev (016, FR-016-26): rollback na točko pred spremembo tipa vrne prejšnji tip ključa in
 * vrednosti dobesedno (brez normalizacije), deli naslova se obnovijo, vrednosti kontaktov zunaj rollbacka morajo
 * ustrezati obnovljenemu tipu (sicer {@code 409 ATTRIBUTE_TYPE_CONFLICT} in nič se ne spremeni).
 */
@Tag("FR-016-26")
class RollbackAttributeTypeIT extends TypedAuditApiTest {

    @Test
    void rollbackBeforeATypeChangeRestoresTheTypeAndTheValuesLiterally() throws Exception {
        Scenario s = scenario();
        UUID contact = idOf(createWithAttribute(s, "Ana", "Mobilni", "041 123 456"));
        UUID created = (UUID) audit.entries(s.group()).get(0).get("id");
        changeTypeOk(s, "mobilni", "PHONE", 0);
        assertThat(keyType(s, "mobilni")).isEqualTo("PHONE");
        long versionBefore = versionOf(detail(s, contact));

        Map<String, Object> entry = rollbackToEntry(s, created);

        assertThat(entry).containsEntry("action", "ROLLBACK");
        assertThat(keyType(s, "mobilni")).isEqualTo("OTHER");
        Map<String, Object> restored = detail(s, contact);
        assertThat(attributeOf(restored, "Mobilni"))
                .containsEntry("type", "OTHER")
                .containsEntry("value", "041 123 456");
        assertThat(versionOf(restored)).isGreaterThan(versionBefore);
    }

    @Test
    void rollbackToTheInitialStateRestoresTheTypeOfAContactThatPredatesTheTrace() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Stari", "Kontakt");
        contacts.addAttribute(contact, 0, "Mobilni", "041 123 456");
        jdbc.update("insert into attribute_key (group_id, key_norm) values (?, 'mobilni')", s.group());
        changeTypeOk(s, "mobilni", "PHONE", 0);

        HttpResponse<String> response = rollbackInitial(s, Who.ADMIN, audit.latestEntryId(s.group()));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(keyType(s, "mobilni")).isEqualTo("OTHER");
        assertThat(contacts.attributesOf(contact)).containsExactly(Map.of("key", "Mobilni", "value", "041 123 456"));
    }

    @Test
    void contactsCreatedAfterTheTypeChangeAreRemovedAndTheOthersAreConsistent() throws Exception {
        Scenario s = scenario();
        UUID first = idOf(createWithAttribute(s, "Ana", "Mobilni", "041 123 456"));
        UUID created = (UUID) audit.entries(s.group()).get(0).get("id");
        changeTypeOk(s, "mobilni", "PHONE", 0);
        UUID later = idOf(createTyped(s, "Bor", "Mobilni", "PHONE", "031 222 333"));

        rollbackToEntry(s, created);

        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(contacts.attributesOf(first)).containsExactly(Map.of("key", "Mobilni", "value", "041 123 456"));
        assertThat(jdbc.queryForObject("select count(*) from contact where id = ?", Long.class, later))
                .isZero();
        assertThat(keyType(s, "mobilni")).isEqualTo("OTHER");
    }

    @Test
    void rollbackToAPointAfterTheTypeChangeKeepsTheType() throws Exception {
        Scenario s = scenario();
        UUID contact = idOf(createWithAttribute(s, "Ana", "Mobilni", "041 123 456"));
        UUID typed = changeTypeOk(s, "mobilni", "PHONE", 0);
        Map<String, Object> current = detail(s, contact);
        Map<String, Object> values = valuesOf(current);
        values.put("firstName", "Anica");
        update(s, Who.EDITOR, contact, values, versionOf(current));

        rollbackToEntry(s, typed);

        assertThat(keyType(s, "mobilni")).isEqualTo("PHONE");
        Map<String, Object> restored = detail(s, contact);
        assertThat(restored).containsEntry("firstName", "Ana");
        assertThat(attributeOf(restored, "Mobilni"))
                .containsEntry("type", "PHONE")
                .containsEntry("value", "+38641123456");
    }

    @Test
    void addressPartsOfTheContactAndOfAnAttributeAreRestoredLiterally() throws Exception {
        Scenario s = scenario();
        Map<String, Object> parts =
                Map.of("street", "Trg 1", "postalCode", "1000", "city", "Ljubljana", "country", "SI");
        Map<String, Object> home = Map.of("street", "Cesta 2", "city", "Maribor");
        Map<String, Object> input = input("Ana", "Naslov");
        input.put("addressParts", parts);
        input.put("attributes", List.of(Map.of("key", "Domov", "type", "ADDRESS", "parts", home)));
        Map<String, Object> created = create(s, Who.EDITOR, input);
        UUID contact = idOf(created);
        UUID first = (UUID) audit.entries(s.group()).get(0).get("id");
        Map<String, Object> values = valuesOf(created);
        values.remove("addressParts");
        values.put("address", "Drugje 5");
        values.put("attributes", List.of());
        update(s, Who.EDITOR, contact, values, versionOf(created));

        rollbackToEntry(s, first);

        Map<String, Object> restored = detail(s, contact);
        assertThat(asObject(restored.get("addressParts"))).isEqualTo(parts);
        assertThat(attributeOf(restored, "Domov"))
                .containsEntry("type", "ADDRESS")
                .containsEntry("parts", home);
    }

    @Test
    void valuesOfContactsOutsideTheRollbackMustFitTheRestoredType() throws Exception {
        Scenario s = scenario();
        UUID ana = idOf(createTyped(s, "Ana", "Mobilni", "PHONE", "041 123 456"));
        UUID created = (UUID) audit.entries(s.group()).get(0).get("id");
        changeTypeOk(s, "mobilni", "OTHER", 0);
        // Kontakt brez vnosov sledi z vrednostjo, ki ni telefon: rollback ga ne zajame.
        UUID bor = contacts.insert(s.group(), s.id(Who.OWNER), "Bor", "Zunaj");
        contacts.addAttribute(bor, 0, "Mobilni", "ni telefon");
        Map<String, Object> before = Map.of(
                "key", jdbc.queryForMap("select type, version from attribute_key where group_id = ?", s.group()),
                "ana", contacts.row(ana),
                "entries", audit.count(s.group()));

        HttpResponse<String> response = rollback(s, Who.ADMIN, created, audit.latestEntryId(s.group()));

        assertThat(response.statusCode()).isEqualTo(409);
        Map<String, Object> body = json(response.body());
        assertThat(body).containsEntry("code", "ATTRIBUTE_TYPE_CONFLICT");
        assertThat(asObject(body.get("details"))).containsEntry("total", 1);
        assertThat(keyType(s, "mobilni")).isEqualTo("OTHER");
        assertThat(Map.of(
                        "key",
                        jdbc.queryForMap("select type, version from attribute_key where group_id = ?", s.group()),
                        "ana",
                        contacts.row(ana),
                        "entries",
                        audit.count(s.group())))
                .isEqualTo(before);
    }
}
