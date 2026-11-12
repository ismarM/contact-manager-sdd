package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.MergeApiTest;

/**
 * Atomarnost združitve (FR-011-15, FR-005-04): ob napaki pri brisanju kontakta ali pisanju sledi se ne spremeni nič.
 * Napaka se vsili s sprožilcem SQL, ki velja samo za kontakt oziroma skupino tega testa (F6), se vedno odstrani v
 * {@code finally} in ne vpliva na druge teste v isti bazi. Razred ni {@code @Execution(CONCURRENT)}.
 */
@Tag("FR-011-15")
class MergeAtomicityIT extends MergeApiTest {

    private record Three(UUID a, UUID b, UUID c) {
        List<UUID> all() {
            return List.of(a, b, c);
        }
    }

    /** Tri kontakte prek API-ja 004, z atributi in značkami. */
    private Three three(Scenario s) throws Exception {
        UUID a = uuid(createContact(
                s, "Ana", "Prva", "ana@primer.si", List.of(attribute("oddelek", "IT")), List.of("vip", "stari")));
        UUID b = uuid(createContact(
                s, "Ana", "Druga", "ana@primer.si", List.of(attribute("mesto", "Maribor")), List.of("b")));
        UUID c = uuid(createContact(s, "Ana", "Tretja", "ana@primer.si", List.of(), List.of("c")));
        return new Three(a, b, c);
    }

    private Map<String, Object> mergedValues() {
        return result("Ana", "Prva", null, "ana@primer.si", null, List.of(attribute("oddelek", "IT")), List.of("vip"));
    }

    @Test
    void aFailureWhenDeletingOneContactLeavesAllThreeUntouched() throws Exception {
        Scenario s = scenario();
        Three t = three(s);
        Snapshot before = snapshot(s.group());
        String trigger = null;
        try {
            trigger = installFailingTrigger("contact", "DELETE", "OLD.id = '" + t.c() + "'");

            HttpResponse<String> response =
                    merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.all(), mergedValues()));

            assertThat(response.statusCode()).as(response.body()).isBetween(500, 599);
            assertUnchanged(before, snapshot(s.group()));
            assertThat(contacts.exists(t.b())).isTrue();
            assertThat(contacts.exists(t.c())).isTrue();
            assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
        } finally {
            if (trigger != null) {
                dropTrigger("contact", trigger);
            }
        }
        assertTheSameMergeNowSucceeds(s, t, before);
    }

    @Test
    @Tag("FR-005-04")
    void aTrailThatCannotBeWrittenLeavesAllThreeUntouched() throws Exception {
        Scenario s = scenario();
        Three t = three(s);
        Snapshot before = snapshot(s.group());
        String trigger = null;
        try {
            trigger = installFailingTrigger(
                    "audit_entry", "INSERT", "NEW.group_id = '" + s.group() + "' AND NEW.action = 'MERGE'");

            HttpResponse<String> response =
                    merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.all(), mergedValues()));

            assertThat(response.statusCode()).as(response.body()).isBetween(500, 599);
            assertUnchanged(before, snapshot(s.group()));
            assertThat(contacts.exists(t.b())).isTrue();
            assertThat(contacts.exists(t.c())).isTrue();
            assertThat(auditEntries(s.group(), "MERGE")).isEmpty();
        } finally {
            if (trigger != null) {
                dropTrigger("audit_entry", trigger);
            }
        }
        assertTheSameMergeNowSucceeds(s, t, before);
    }

    /**
     * Ista združitev po odstranitvi sprožilca uspe: napaka je bila res posledica sprožilca, neuspeli poskus ni pustil
     * stanja (vrednosti, vnosi sledi), uspešna združitev pa je spet natanko ena in ima en vnos {@code MERGE}.
     */
    private void assertTheSameMergeNowSucceeds(Scenario s, Three t, Snapshot before) throws Exception {
        assertThat(leftoverTriggers()).isZero();

        HttpResponse<String> response = merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(t.all(), mergedValues()));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(json(response.body()))
                .containsEntry("keptContactId", t.a().toString())
                .containsEntry("mergedCount", 3);
        assertThat(contacts.exists(t.a())).isTrue();
        assertThat(contacts.exists(t.b())).isFalse();
        assertThat(contacts.exists(t.c())).isFalse();
        assertThat(contacts.tagsOf(t.a())).containsExactly("vip");
        assertThat(auditEntries(s.group(), "MERGE")).hasSize(1);
        assertThat(audit.count(s.group())).isEqualTo(before.auditEntries() + 1);
    }
}
