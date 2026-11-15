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
 * Kanonični zapis ključev in značk na strežniku (FR-013-10, FR-013-15; SC-002): pogostejša različica v skupini, pri
 * izenačenju zapis najstarejšega kontakta; zapis, ki ga kontakt že ima, in vsi shranjeni podatki ostanejo nespremenjeni.
 */
@Tag("FR-013-10")
class CanonicalKeysIT extends MergeApiTest {

    private static List<Map<String, String>> attrs(String... pairs) {
        List<Map<String, String>> list = new java.util.ArrayList<>();
        for (int i = 0; i < pairs.length; i += 2) {
            list.add(attribute(pairs[i], pairs[i + 1]));
        }
        return list;
    }

    private List<String> keysOf(UUID contact) {
        return contacts.attributesOf(contact).stream()
                .map(a -> (String) a.get("key"))
                .toList();
    }

    @Test
    void createReplacesAKeyAndATagThatDifferOnlyInCaseWithTheGroupForm() throws Exception {
        Scenario s = scenario();
        UUID first = contacts.insert(s.group(), s.id(Who.OWNER), "Ana", "Prva");
        contacts.addAttribute(first, 0, "Kompetenca", "web dev");
        contacts.addTag(first, 0, "vip");

        Map<String, Object> created = createContact(
                s, "Bojan", "Drugi", null, attrs("KOMPETENCA", "data", "Nov ključ", "x"), List.of("VIP", "Nova"));

        assertThat(asObjects(created.get("attributes")))
                .extracting(a -> a.get("key"))
                .containsExactly("Kompetenca", "Nov ključ");
        assertThat(asStrings(created.get("tags"))).containsExactly("vip", "Nova");
    }

    @Test
    void theMostFrequentFormWinsAndWithEqualCountsTheOldestContactsForm() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "A", "A");
        contacts.addAttribute(a, 0, "kompetenca", "x");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "B", "B");
        contacts.addAttribute(b, 0, "Kompetenca", "x");
        UUID c = contacts.insert(s.group(), s.id(Who.OWNER), "C", "C");
        contacts.addAttribute(c, 0, "Kompetenca", "x");

        Map<String, Object> created = createContact(s, "D", "D", null, attrs("kOmPeTeNcA", "y"), null);
        assertThat(asObjects(created.get("attributes")).get(0)).containsEntry("key", "Kompetenca");

        // izenačenje: pri enakem številu prevlada zapis najstarejšega kontakta
        jdbc.update("update contact set created_at = now() - interval '2 day' where id = ?", a);
        jdbc.update("delete from contact where id = ?", c);
        jdbc.update("delete from contact where id = ?", uuid(created));
        Map<String, Object> second = createContact(s, "E", "E", null, attrs("KOMPETENCA", "y"), null);
        assertThat(asObjects(second.get("attributes")).get(0)).containsEntry("key", "kompetenca");
    }

    @Test
    void existingStoredDataAreNeverRewritten() throws Exception {
        Scenario s = scenario();
        UUID a = contacts.insert(s.group(), s.id(Who.OWNER), "A", "A");
        contacts.addAttribute(a, 0, "kompetenca", "x");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "B", "B");
        contacts.addAttribute(b, 0, "Kompetenca", "x");
        UUID c = contacts.insert(s.group(), s.id(Who.OWNER), "C", "C");
        contacts.addAttribute(c, 0, "Kompetenca", "x");
        long versionA = contacts.version(a);

        createContact(s, "D", "D", null, attrs("kompetenca", "y"), null);

        assertThat(keysOf(a)).containsExactly("kompetenca");
        assertThat(keysOf(b)).containsExactly("Kompetenca");
        assertThat(contacts.version(a)).isEqualTo(versionA);
    }

    @Test
    void updateKeepsTheSpellingTheContactAlreadyHasButCanonicalisesAChangedOne() throws Exception {
        Scenario s = scenario();
        UUID legacy = contacts.insert(s.group(), s.id(Who.OWNER), "A", "A");
        contacts.addAttribute(legacy, 0, "kompetenca", "x");
        UUID b = contacts.insert(s.group(), s.id(Who.OWNER), "B", "B");
        contacts.addAttribute(b, 0, "Kompetenca", "x");
        UUID c = contacts.insert(s.group(), s.id(Who.OWNER), "C", "C");
        contacts.addAttribute(c, 0, "Kompetenca", "x");

        // nespremenjen zapis (kontakt ga že ima) ostane, čeprav je skupinski zapis drugačen
        Map<String, Object> keep = new java.util.LinkedHashMap<>(input("A", "A"));
        keep.put("attributes", attrs("kompetenca", "nova vrednost"));
        keep.put("version", contacts.version(legacy));
        HttpResponse<String> kept = put(contactPath(s.group(), legacy), s.token(Who.EDITOR), body(keep));
        assertThat(kept.statusCode()).as(kept.body()).isEqualTo(200);
        assertThat(keysOf(legacy)).containsExactly("kompetenca");

        // spremenjen zapis (npr. KOMPETENCA) se uskladi s skupinskim
        Map<String, Object> change = new java.util.LinkedHashMap<>(input("A", "A"));
        change.put("attributes", attrs("KOMPETENCA", "nova vrednost"));
        change.put("version", contacts.version(legacy));
        HttpResponse<String> changed = put(contactPath(s.group(), legacy), s.token(Who.EDITOR), body(change));
        assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);
        assertThat(keysOf(legacy)).containsExactly("Kompetenca");
    }

    @Test
    void savingAKeyOnlyChangedInCaseToTheSameCanonicalFormIsNoChange() throws Exception {
        Scenario s = scenario();
        Map<String, Object> created = createContact(s, "A", "A", null, attrs("Kompetenca", "x"), null);
        long version = ((Number) created.get("version")).longValue();
        int entries = audit.count(s.group());

        Map<String, Object> same = new java.util.LinkedHashMap<>(input("A", "A"));
        same.put("attributes", attrs("kompetenca", "x"));
        same.put("version", version);
        HttpResponse<String> response = put(contactPath(s.group(), created.get("id")), s.token(Who.EDITOR), body(same));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(((Number) json(response.body()).get("version")).longValue()).isEqualTo(version);
        assertThat(audit.count(s.group())).isEqualTo(entries);
    }

    @Test
    void duplicateKeysInOneContactDifferingInCaseStayRejected() throws Exception {
        Scenario s = scenario();
        Map<String, Object> input = new java.util.LinkedHashMap<>(input("A", "A"));
        input.put("attributes", attrs("Kompetenca", "x", "kompetenca", "y"));

        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("attributes[1].key", "DUPLICATE");
    }

    @Test
    void bulkUpdateUsesTheCanonicalFormForAttributeKeysAndAddedTags() throws Exception {
        Scenario s = scenario();
        UUID first = contacts.insert(s.group(), s.id(Who.OWNER), "A", "A");
        contacts.addAttribute(first, 0, "Kompetenca", "x");
        contacts.addTag(first, 0, "vip");
        UUID target = contacts.insert(s.group(), s.id(Who.OWNER), "B", "B");
        Map<String, Object> request = new java.util.LinkedHashMap<>();
        request.put("contactIds", List.of(target.toString()));
        request.put("addTags", List.of("VIP"));
        request.put("attributes", List.of(Map.of("field", "custom", "key", "KOMPETENCA", "value", "data")));

        HttpResponse<String> response =
                post("/api/groups/" + s.group() + "/contacts/bulk-update", s.token(Who.EDITOR), body(request));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(keysOf(target)).containsExactly("Kompetenca");
        assertThat(contacts.tagsOf(target)).containsExactly("vip");
        assertThat(keysOf(first)).containsExactly("Kompetenca");
    }

    @Test
    void mergeUsesTheCanonicalFormExceptForSpellingsHeldByTheMergedContacts() throws Exception {
        Scenario s = scenario();
        UUID other = contacts.insert(s.group(), s.id(Who.OWNER), "Drug", "Kontakt");
        contacts.addAttribute(other, 0, "Vloga", "x");
        contacts.addTag(other, 0, "vip");
        Map<String, Object> a = createContact(s, "Janez", "Novak", "janez@feri.si", attrs("kompetenca", "x"), null);
        Map<String, Object> b = createContact(s, "Janez", "Novak", "janez@feri.si", attrs("Cilj", "y"), null);
        Map<String, Object> result = simpleResult("Janez", "Novak", "janez@feri.si");
        result.put("attributes", attrs("kompetenca", "x", "VLOGA", "z", "Cilj", "y"));
        result.put("tags", List.of("VIP"));

        HttpResponse<String> response =
                merge(s.token(Who.EDITOR), s.group(), mergeBodyNow(List.of(uuid(a), uuid(b)), result));

        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        UUID keeper = UUID.fromString((String) json(response.body()).get("keptContactId"));
        assertThat(keysOf(keeper)).containsExactly("kompetenca", "Vloga", "Cilj");
        assertThat(contacts.tagsOf(keeper)).containsExactly("vip");
    }
}
