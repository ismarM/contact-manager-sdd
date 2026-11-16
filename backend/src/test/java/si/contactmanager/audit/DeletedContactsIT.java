package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.audit.support.HistoryApiTest;

/** Seznam izbrisanih kontaktov, izpeljan iz sledi (FR-015-22 … FR-015-24): razvrstitev, iskanje, filter, izolacija. */
class DeletedContactsIT extends HistoryApiTest {

    private List<Map<String, Object>> items(Scenario s, String query) throws Exception {
        return asObjects(deleted(s, Who.VIEWER, query).get("items"));
    }

    private static Object name(Map<String, Object> item) {
        return item.get("displayName");
    }

    @Test
    @Tag("FR-015-22")
    @Tag("FR-015-24")
    void theListHasDeletedRolledBackAndMergedContactsAndNoLiveOnes() throws Exception {
        Scenario s = scenario();
        Map<String, Object> live = create(s, Who.EDITOR, contactInput("Živa", "Živa", "+38690000000"));
        Map<String, Object> deleted = create(s, Who.EDITOR, contactInput("Dana", "Izbrisana", "+38690111111"));
        Map<String, Object> keeper = create(s, Who.EDITOR, contactInput("Marko", "Ohranjen", "+38690222222"));
        Map<String, Object> merged = create(s, Who.EDITOR, contactInput("Marko", "Združen", "+38690222222"));
        UUID beforeRolledBack = audit.latestEntryId(s.group());
        Map<String, Object> rolledBack = create(s, Who.EDITOR, contactInput("Rok", "Povrnjen", "+38690333333"));
        rollback(s, Who.ADMIN, beforeRolledBack, audit.latestEntryId(s.group()));
        remove(s, Who.ADMIN, idOf(deleted), versionOf(deleted));
        mergeInto(s, idOf(keeper), idOf(merged), s.id(Who.EDITOR));

        Map<String, Object> page = deleted(s, Who.VIEWER, "");

        List<Map<String, Object>> items = asObjects(page.get("items"));
        assertThat(page.get("total")).isEqualTo(3);
        assertThat(items)
                .extracting(DeletedContactsIT::name)
                .containsExactly("Marko Združen", "Dana Izbrisana", "Rok Povrnjen");
        Map<String, Object> mergedItem = items.get(0);
        assertThat(mergedItem.get("reason")).isEqualTo("MERGED");
        assertThat(mergedItem.get("restorable")).isEqualTo(false);
        assertThat(asObject(mergedItem.get("mergedInto")).get("contactId"))
                .isEqualTo(idOf(keeper).toString());
        assertThat(asObject(mergedItem.get("mergedInto")).get("exists")).isEqualTo(true);
        assertThat(items.get(1).get("reason")).isEqualTo("DELETED");
        assertThat(items.get(1).get("restorable")).isEqualTo(true);
        assertThat(items.get(1).get("mergedInto")).isNull();
        assertThat(items.get(2).get("reason")).isEqualTo("ROLLBACK");
        assertThat(items.get(2).get("restorable")).isEqualTo(true);
        assertThat(asObject(items.get(1).get("removedBy")).get("email"))
                .isEqualTo(groups.email(s.users().get(Who.ADMIN).uid()));
        assertThat(items.get(1).get("contactId")).isEqualTo(idOf(deleted).toString());
        assertThat(items).extracting(DeletedContactsIT::name).doesNotContain("Živa Živa", "Marko Ohranjen");
        assertThat(contacts.exists(idOf(live))).isTrue();
        assertThat(contacts.exists(idOf(rolledBack))).isFalse();
    }

    @Test
    @Tag("FR-015-22")
    void aRestoredContactLeavesTheListAndADeletedAgainOneAppearsOnceWithTheLastState() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "+38690111111"));
        remove(s, Who.EDITOR, idOf(a), versionOf(a));
        Map<String, Object> history = history(s, Who.VIEWER, idOf(a), "");
        String last = (String) asObject(history.get("contact")).get("lastEntryId");
        String version = (String) asObjects(history.get("items")).get(1).get("entryId");
        assertThat(items(s, "")).hasSize(1);

        restore(s, Who.EDITOR, idOf(a), restoreDeletedBody(version, last));
        assertThat(items(s, "")).isEmpty();
        Map<String, Object> current =
                json(get(contactPath(s.group(), idOf(a)), s.token(Who.VIEWER)).body());
        remove(s, Who.EDITOR, idOf(a), versionOf(current));

        List<Map<String, Object>> again = items(s, "");
        assertThat(again).hasSize(1);
        assertThat(again.get(0).get("entryId"))
                .isEqualTo(entryIds(s).get(entryIds(s).size() - 1).toString());
        assertThat(deleted(s, Who.VIEWER, "").get("total")).isEqualTo(1);
    }

    @Test
    @Tag("FR-015-23")
    void searchIgnoresCaseAndDiacriticsAndFilterSplitsRestorableFromMerged() throws Exception {
        Scenario s = scenario();
        Map<String, Object> inputCeh = contactInput("Jože", "Čeh", "+38690111111");
        inputCeh.put("email", "joze.ceh@primer.si");
        inputCeh.put("company", "Acme d.o.o.");
        Map<String, Object> ceh = create(s, Who.EDITOR, inputCeh);
        Map<String, Object> other = create(s, Who.EDITOR, contactInput("Nina", "Novak", "+38690222222"));
        Map<String, Object> keeper = create(s, Who.EDITOR, contactInput("Tina", "Ohranjena", "+38690333333"));
        Map<String, Object> merged = create(s, Who.EDITOR, contactInput("Tina", "Združena", "+38690333333"));
        remove(s, Who.EDITOR, idOf(ceh), versionOf(ceh));
        remove(s, Who.EDITOR, idOf(other), versionOf(other));
        mergeInto(s, idOf(keeper), idOf(merged), s.id(Who.EDITOR));

        assertThat(items(s, "?q=ceh")).extracting(DeletedContactsIT::name).containsExactly("Jože Čeh");
        assertThat(items(s, "?q=JOZE.CEH@PRIMER")).hasSize(1);
        assertThat(items(s, "?q=acme")).hasSize(1);
        assertThat(items(s, "?q=nezadetek")).isEmpty();
        assertThat(items(s, "?state=restorable")).hasSize(2);
        assertThat(items(s, "?state=merged"))
                .extracting(DeletedContactsIT::name)
                .containsExactly("Tina Združena");
        assertThat(items(s, "?state=merged&q=ceh")).isEmpty();
        assertThat(asObjects(deleted(s, Who.VIEWER, "?q=ceh").get("items"))
                        .get(0)
                        .get("email"))
                .isEqualTo("joze.ceh@primer.si");
        assertThat(asObjects(deleted(s, Who.VIEWER, "?q=ceh").get("items"))
                        .get(0)
                        .get("company"))
                .isEqualTo("Acme d.o.o.");
    }

    @Test
    @Tag("FR-015-22")
    @Tag("FR-015-23")
    void paginationAndParameterValidation() throws Exception {
        Scenario s = scenario();
        for (int i = 0; i < 27; i++) {
            Map<String, Object> c = create(s, Who.EDITOR, contactInput("Kontakt", "Št" + i, "+38690000000"));
            remove(s, Who.EDITOR, idOf(c), versionOf(c));
        }

        Map<String, Object> first = deleted(s, Who.VIEWER, "");
        Map<String, Object> second = deleted(s, Who.VIEWER, "?page=1");

        assertThat(first.get("total")).isEqualTo(27);
        assertThat(asObjects(first.get("items"))).hasSize(25);
        assertThat(asObjects(second.get("items"))).hasSize(2);
        assertThat(asObjects(deleted(s, Who.VIEWER, "?size=50").get("items"))).hasSize(27);
        for (String bad : List.of("?size=30", "?state=nonsense", "?page=-1", "?q=" + "x".repeat(101))) {
            assertThat(get(deletedPath(s.group()) + bad, s.token(Who.VIEWER)).statusCode())
                    .as(bad)
                    .isEqualTo(400);
        }
    }

    @Test
    @Tag("FR-015-22")
    @Tag("FR-015-21")
    void deletedContactsOfAnotherGroupNeverLeakAndArchivedGroupsCanBeRead() throws Exception {
        Scenario s = scenario();
        Scenario other = scenario();
        Map<String, Object> mine = create(s, Who.EDITOR, contactInput("Moj", "Izbrisan", "+38690111111"));
        Map<String, Object> theirs = create(other, Who.EDITOR, contactInput("Tuj", "Izbrisan", "+38690222222"));
        remove(s, Who.EDITOR, idOf(mine), versionOf(mine));
        remove(other, Who.EDITOR, idOf(theirs), versionOf(theirs));
        groups.archive(s.group());

        HttpResponse<String> response = get(deletedPath(s.group()), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items")))
                .extracting(DeletedContactsIT::name)
                .containsExactly("Moj Izbrisan");
        assertThat(get(historyPath(s.group(), idOf(theirs)), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(404);
        assertThat(get(deletedPath(s.group()), s.token(Who.NON_MEMBER)).statusCode())
                .isEqualTo(404);
    }
}
