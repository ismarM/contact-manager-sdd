package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.AttributeType;
import si.contactmanager.contact.ContactState;
import si.contactmanager.support.ApiTest;

/**
 * Vrsta dejanja {@code ATTRIBUTE_TYPE} (016, FR-016-26): vnos nosi ključ ter tipa pred in po, spremembe kontaktov so
 * običajne; običajni {@code record} te vrste ne zapiše; zapis zahteva obdajajočo transakcijo.
 */
@Tag("FR-016-26")
class AttributeTypeAuditIT extends ApiTest {

    @Autowired
    AuditLog audit;

    @Autowired
    TransactionTemplate tx;

    private static ContactState state(AttributeType type, String value, long version) {
        return new ContactState(
                "Ana",
                "Novak",
                null,
                null,
                null,
                List.of(new Attribute("Mobilni", type, value, null)),
                List.of(),
                version,
                Instant.parse("2026-01-01T10:00:00Z"),
                Instant.parse("2026-01-01T10:00:00Z"),
                null);
    }

    private UUID group() {
        UUID group = UUID.randomUUID();
        jdbc.update("insert into contact_group (id, title) values (?, 'Skupina')", group);
        return group;
    }

    private long actor() {
        String uid = "uid-" + UUID.randomUUID();
        return jdbc.queryForObject(
                "insert into app_user (firebase_uid, name, email) values (?, 'Izvajalec', ?) returning id",
                Long.class,
                uid,
                uid + "@primer.si");
    }

    @Test
    void recordsKeyAndBothTypesWithOneChangePerContact() {
        UUID group = group();
        long actor = actor();
        UUID contact = UUID.randomUUID();
        List<ContactChange> changes = List.of(new ContactChange(
                contact,
                "Ana Novak",
                state(AttributeType.OTHER, "041 123 456", 1),
                state(AttributeType.PHONE, "+38641123456", 2)));

        UUID entry = tx.execute(s -> audit.recordAttributeType(group, actor, "mobilni", "OTHER", "PHONE", changes));

        Map<String, Object> row = jdbc.queryForMap(
                "select action, contact_count, attribute_key, type_before, type_after, target_entry_id from audit_entry"
                        + " where id = ?",
                entry);
        assertThat(row)
                .containsEntry("action", "ATTRIBUTE_TYPE")
                .containsEntry("contact_count", 1)
                .containsEntry("attribute_key", "mobilni")
                .containsEntry("type_before", "OTHER")
                .containsEntry("type_after", "PHONE")
                .containsEntry("target_entry_id", null);
        assertThat(jdbc.queryForObject("select count(*) from audit_change where entry_id = ?", Long.class, entry))
                .isEqualTo(1);
    }

    @Test
    void ordinaryEntriesHaveNoKeyOrTypes() {
        UUID group = group();
        long actor = actor();
        ContactChange created =
                new ContactChange(UUID.randomUUID(), "Ana Novak", null, state(AttributeType.OTHER, "x", 0));

        UUID entry = tx.execute(s -> audit.record(group, actor, AuditAction.CREATE, List.of(created)));

        Map<String, Object> row =
                jdbc.queryForMap("select attribute_key, type_before, type_after from audit_entry where id = ?", entry);
        assertThat(row.values()).containsOnlyNulls();
    }

    @Test
    void theGenericRecordRefusesAttributeType() {
        UUID group = group();
        long actor = actor();
        ContactChange change = new ContactChange(
                UUID.randomUUID(), "Ana", state(AttributeType.OTHER, "a", 1), state(AttributeType.PHONE, "b", 2));

        assertThatThrownBy(() -> tx.executeWithoutResult(
                        s -> audit.record(group, actor, AuditAction.ATTRIBUTE_TYPE, List.of(change))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void invalidArgumentsAndMissingTransactionAreRefused() {
        UUID group = group();
        long actor = actor();
        ContactChange change = new ContactChange(
                UUID.randomUUID(), "Ana", state(AttributeType.OTHER, "a", 1), state(AttributeType.PHONE, "b", 2));
        ContactChange created = new ContactChange(UUID.randomUUID(), "Ana", null, state(AttributeType.PHONE, "b", 2));

        assertThatThrownBy(() -> tx.executeWithoutResult(
                        s -> audit.recordAttributeType(group, actor, "k", "PHONE", "PHONE", List.of(change))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(
                        s -> audit.recordAttributeType(group, actor, "k", "OTHER", "PHONE", List.of())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> tx.executeWithoutResult(
                        s -> audit.recordAttributeType(group, actor, "k", "OTHER", "PHONE", List.of(created))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> audit.recordAttributeType(group, actor, "k", "OTHER", "PHONE", List.of(change)))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(jdbc.queryForObject("select count(*) from audit_entry where group_id = ?", Long.class, group))
                .isZero();
    }
}
