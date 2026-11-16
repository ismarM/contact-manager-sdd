package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.AuditApiTest;

/** Migracija V11 (015): vrsta {@code RESTORE} je dovoljena samo s ciljem, vnosi 005 ostanejo nespremenljivi. */
class RestoreMigrationIT extends AuditApiTest {

    private void insert(UUID group, long seq, long actor, String action, UUID target, boolean initial) {
        jdbc.update(
                "insert into audit_entry (group_id, seq, actor_id, action, contact_count, target_entry_id, target_initial)"
                        + " values (?, ?, ?, ?, 1, ?, ?)",
                group,
                seq,
                actor,
                action,
                target,
                initial);
    }

    @Test
    @Tag("FR-015-12")
    void restoreNeedsExactlyOneTargetAndOtherKindsNone() throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        UUID entry = audit.entries(s.group()).get(0).get("id") instanceof UUID id ? id : null;
        long actor = s.id(Who.EDITOR);

        insert(s.group(), 10, actor, "RESTORE", entry, false);
        insert(s.group(), 11, actor, "RESTORE", null, true);
        insert(s.group(), 12, actor, "ROLLBACK", entry, false);

        assertThatThrownBy(() -> insert(s.group(), 13, actor, "RESTORE", null, false))
                .hasMessageContaining("audit_entry_target");
        assertThatThrownBy(() -> insert(s.group(), 14, actor, "RESTORE", entry, true))
                .hasMessageContaining("audit_entry_target");
        assertThatThrownBy(() -> insert(s.group(), 15, actor, "UPDATE", entry, false))
                .hasMessageContaining("audit_entry_target");
        assertThatThrownBy(() -> insert(s.group(), 16, actor, "UNKNOWN", null, false))
                .hasMessageContaining("audit_entry_action_check");
        assertThat(audit.count(s.group())).isEqualTo(4);
    }

    @Test
    @Tag("FR-015-12")
    void existingEntriesStayImmutable() throws Exception {
        Scenario s = scenario();
        create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        Map<String, Object> entry = audit.entries(s.group()).get(0);

        assertThatThrownBy(() -> jdbc.update("update audit_entry set action = 'RESTORE' where id = ?", entry.get("id")))
                .hasMessageContaining("nespremenljiv");
    }
}
