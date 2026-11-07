package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Seznam in pogled kontaktov (FR-004-06, FR-004-07, FR-004-08, FR-004-14; SC-002). */
class ContactReadIT extends ContactApiTest {

    private static List<Map<String, Object>> items(String body) {
        return asObjects(json(body).get("items"));
    }

    private static List<String> names(String body) {
        return items(body).stream()
                .map(item -> (String) item.get("displayName"))
                .toList();
    }

    @Test
    @Tag("FR-004-06")
    void firstPageHas25ContactsOfSixtyWithTotalAndSortedByLastThenFirstName() throws Exception {
        Scenario s = scenario();
        contacts.insertMany(s.group(), s.id(Who.OWNER), 60);

        HttpResponse<String> response = get(contactsPath(s.group()), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> page = json(response.body());
        assertThat(page).containsOnlyKeys("total", "page", "size", "items");
        assertThat(((Number) page.get("total")).longValue()).isEqualTo(60);
        assertThat(page).containsEntry("page", 0).containsEntry("size", 25);
        assertThat(items(response.body())).hasSize(25);
        assertThat(names(response.body()).getFirst()).isEqualTo("Ime 00001 Priimek 00001");
        assertThat(names(response.body()).get(24)).isEqualTo("Ime 00025 Priimek 00025");
    }

    @Test
    @Tag("FR-004-06")
    void pagesAreConsecutiveWithoutRepeatedOrMissingContacts() throws Exception {
        Scenario s = scenario();
        List<UUID> all = contacts.insertMany(s.group(), s.id(Who.OWNER), 60);
        List<String> seen = new ArrayList<>();

        for (int page = 0; page < 3; page++) {
            HttpResponse<String> response =
                    get(contactsPath(s.group()) + "?page=" + page + "&size=25", s.token(Who.VIEWER));
            assertThat(response.statusCode()).isEqualTo(200);
            items(response.body()).forEach(item -> seen.add((String) item.get("id")));
        }

        assertThat(seen).hasSize(60).doesNotHaveDuplicates();
        assertThat(seen)
                .containsExactlyInAnyOrderElementsOf(
                        all.stream().map(UUID::toString).toList());
    }

    @Test
    @Tag("FR-004-06")
    void pageSizeFiftyGivesTheRemainingTenOnTheSecondPage() throws Exception {
        Scenario s = scenario();
        contacts.insertMany(s.group(), s.id(Who.OWNER), 60);

        HttpResponse<String> response = get(contactsPath(s.group()) + "?page=1&size=50", s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(items(response.body())).hasSize(10);
        assertThat(names(response.body()).getFirst()).isEqualTo("Ime 00051 Priimek 00051");
        assertThat(json(response.body())).containsEntry("size", 50).containsEntry("page", 1);
    }

    @Test
    @Tag("FR-004-06")
    void pageBeyondTheLastIsEmptyWithTheCorrectTotal() throws Exception {
        Scenario s = scenario();
        contacts.insertMany(s.group(), s.id(Who.OWNER), 30);

        HttpResponse<String> response = get(contactsPath(s.group()) + "?page=7&size=25", s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(items(response.body())).isEmpty();
        assertThat(((Number) json(response.body()).get("total")).longValue()).isEqualTo(30);
    }

    @ParameterizedTest
    @ValueSource(strings = {"size=10", "size=0", "size=101", "size=abc", "size=", "page=-1", "page=abc"})
    @Tag("FR-004-06")
    void unsupportedPageSizeOrPageIsAValidationError(String query) throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = get(contactsPath(s.group()) + "?" + query, s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(json(response.body())).containsEntry("code", "VALIDATION_FAILED");
        String field = query.substring(0, query.indexOf('='));
        assertThat(fieldErrors(response.body())).containsKey(field);
    }

    @Test
    @Tag("FR-004-06")
    void orderIsByCodePointsIgnoringCaseWithEmptyLastNamesAtTheEndAndStableTies() throws Exception {
        Scenario s = scenario();
        long owner = s.id(Who.OWNER);
        contacts.insert(s.group(), owner, "Ana", "Zupan");
        contacts.insert(s.group(), owner, "Bojan", "Čeh");
        contacts.insert(s.group(), owner, "Cene", "abc");
        contacts.insert(s.group(), owner, "Dana", "Bcd");
        contacts.insert(s.group(), owner, "Fani", null);
        contacts.insert(s.group(), owner, "Eva", null);
        contacts.insert(s.group(), owner, null, "Zupan");
        UUID firstKralj = contacts.insert(s.group(), owner, "Marko", "Kralj");
        UUID secondKralj = contacts.insert(s.group(), owner, "Marko", "Kralj");

        HttpResponse<String> response = get(contactsPath(s.group()), s.token(Who.VIEWER));

        assertThat(names(response.body()))
                .containsExactly(
                        "Cene abc",
                        "Dana Bcd",
                        "Marko Kralj",
                        "Marko Kralj",
                        "Ana Zupan",
                        "Zupan",
                        "Bojan Čeh",
                        "Eva",
                        "Fani");
        List<String> kralj = items(response.body()).stream()
                .map(item -> (String) item.get("id"))
                .filter(id -> id.equals(firstKralj.toString()) || id.equals(secondKralj.toString()))
                .toList();
        assertThat(kralj).containsExactly(firstKralj.toString(), secondKralj.toString());
    }

    @Test
    @Tag("FR-004-06")
    void contactsCreatedAndEditedThroughTheApiAreSortedByCodePointsIgnoringCase() throws Exception {
        Scenario s = scenario();
        for (Map<String, Object> input : List.of(
                input("Ana", "ZUPAN"),
                input("Bojan", "Čeh"),
                input("cene", "abc"),
                input("Dana", "Bcd"),
                input("Fani", null),
                input("eva", null),
                input("Marko", "kralj"),
                input("ana", "Kralj"))) {
            createViaApi(s, input);
        }

        assertThat(names(get(contactsPath(s.group()), s.token(Who.VIEWER)).body()))
                .containsExactly(
                        "cene abc", "Dana Bcd", "ana Kralj", "Marko kralj", "Ana ZUPAN", "Bojan Čeh", "eva", "Fani");

        // Sprememba priimka prek PUT premakne kontakt na novo mesto (ključ razvrščanja se posodobi).
        Map<String, Object> dana = items(
                        get(contactsPath(s.group()), s.token(Who.VIEWER)).body())
                .stream()
                .filter(item -> "Dana Bcd".equals(item.get("displayName")))
                .findFirst()
                .orElseThrow();
        Map<String, Object> renamed = input("Dana", "zzz");
        HttpResponse<String> update = put(
                contactPath(s.group(), dana.get("id")),
                s.token(Who.EDITOR),
                body(withVersion(renamed, ((Number) dana.get("version")).longValue())));
        assertThat(update.statusCode()).isEqualTo(200);
        Map<String, Object> noLastName = items(
                        get(contactsPath(s.group()), s.token(Who.VIEWER)).body())
                .stream()
                .filter(item -> "cene abc".equals(item.get("displayName")))
                .findFirst()
                .orElseThrow();
        assertThat(put(
                                contactPath(s.group(), noLastName.get("id")),
                                s.token(Who.EDITOR),
                                body(withVersion(input("cene", null), 0)))
                        .statusCode())
                .isEqualTo(200);

        assertThat(names(get(contactsPath(s.group()), s.token(Who.VIEWER)).body()))
                .containsExactly(
                        "ana Kralj", "Marko kralj", "Ana ZUPAN", "Dana zzz", "Bojan Čeh", "cene", "eva", "Fani");
    }

    @Test
    @Tag("FR-004-06")
    void listItemCarriesSummaryFieldsTagsInEntryOrderAndVersion() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak", "janez@primer.si", "01 234 567", null);
        contacts.addTag(id, 0, "zeta");
        contacts.addTag(id, 1, "alfa");
        contacts.addTag(id, 2, "Mid");

        HttpResponse<String> response = get(contactsPath(s.group()), s.token(Who.VIEWER));

        Map<String, Object> item = items(response.body()).getFirst();
        assertThat(item)
                .containsOnlyKeys("id", "firstName", "lastName", "displayName", "email", "phone", "tags", "version")
                .containsEntry("id", id.toString())
                .containsEntry("firstName", "Janez")
                .containsEntry("lastName", "Novak")
                .containsEntry("displayName", "Janez Novak")
                .containsEntry("email", "janez@primer.si")
                .containsEntry("phone", "01 234 567")
                .containsEntry("tags", List.of("zeta", "alfa", "Mid"))
                .containsEntry("version", 0);
    }

    @Test
    @Tag("FR-004-07")
    void groupWithoutContactsHasTotalZeroAndEmptyItems() throws Exception {
        Scenario s = scenario();

        HttpResponse<String> response = get(contactsPath(s.group()), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(((Number) json(response.body()).get("total")).longValue()).isZero();
        assertThat(items(response.body())).isEmpty();
    }

    @Test
    @Tag("FR-004-06")
    @Tag("FR-004-08")
    void viewerAndMembersOfAnArchivedGroupRead() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        groups.archive(s.group());

        for (Who who : List.of(Who.VIEWER, Who.EDITOR, Who.ADMIN, Who.OWNER)) {
            assertThat(get(contactsPath(s.group()), s.token(who)).statusCode())
                    .as(who.name())
                    .isEqualTo(200);
            assertThat(get(contactPath(s.group(), id), s.token(who)).statusCode())
                    .as(who.name())
                    .isEqualTo(200);
        }
    }

    @Test
    @Tag("FR-004-08")
    void detailHasAllFieldsAttributesAndTagsInEntryOrder() throws Exception {
        Scenario s = scenario();
        UUID id = contacts.insert(
                s.group(),
                s.id(Who.OWNER),
                "Janez",
                "Novak",
                "janez@primer.si",
                "+386 1 234 56 78",
                "Ulica 1\nLjubljana");
        contacts.addAttribute(id, 0, "kompetenca", "web dev");
        contacts.addAttribute(id, 1, "Oddelek", "IT");
        contacts.addTag(id, 0, "ne_obveščaj");
        contacts.addTag(id, 1, "konferenca2025");

        HttpResponse<String> response = get(contactPath(s.group(), id), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> detail = json(response.body());
        assertThat(detail)
                .containsEntry("id", id.toString())
                .containsEntry("displayName", "Janez Novak")
                .containsEntry("address", "Ulica 1\nLjubljana")
                .containsEntry("email", "janez@primer.si")
                .containsEntry("phone", "+386 1 234 56 78")
                .containsEntry(
                        "attributes",
                        List.of(
                                Map.of("key", "kompetenca", "value", "web dev"),
                                Map.of("key", "Oddelek", "value", "IT")))
                .containsEntry("tags", List.of("ne_obveščaj", "konferenca2025"))
                .containsEntry("version", 0);
        assertThat(detail.get("createdAt")).isInstanceOf(String.class);
        assertThat(detail.get("updatedAt")).isInstanceOf(String.class);
        assertThat(detail.get("updatedBy"))
                .isEqualTo(Map.of(
                        "name",
                        "OWNER",
                        "email",
                        groups.email(s.users().get(Who.OWNER).uid())));
    }

    @Test
    @Tag("FR-004-08")
    void lastEditorWhoDeletedTheAccountIsShownAsNull() throws Exception {
        Scenario s = scenario();
        SignedIn gone = registeredUser("Gone");
        long goneId = groups.userId(gone.uid());
        UUID id = contacts.insert(s.group(), goneId, "Janez", "Novak");
        jdbc.update("delete from app_user where id = ?", goneId);

        HttpResponse<String> response = get(contactPath(s.group(), id), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("updatedBy", null);
    }

    @Test
    @Tag("FR-004-14")
    void contactOfAnotherGroupIsNotFoundEvenForAMemberOfBothGroups() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        HttpResponse<String> response = get(contactPath(s.group(), foreign), s.token(Who.OWNER));
        HttpResponse<String> own = get(contactPath(other, foreign), s.token(Who.OWNER));

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
        assertThat(own.statusCode()).isEqualTo(200);
        assertThat(get(contactPath(s.group(), UUID.randomUUID()), s.token(Who.OWNER))
                        .statusCode())
                .isEqualTo(404);
        assertThat(get(contactPath(s.group(), "not-a-uuid"), s.token(Who.OWNER)).statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-004-14")
    void listOfAGroupNeverContainsContactsOfAnotherGroup() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.OWNER), "Druga skupina");
        contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");
        contacts.insert(s.group(), s.id(Who.OWNER), "Moj", "Kontakt");

        HttpResponse<String> response = get(contactsPath(s.group()), s.token(Who.OWNER));

        assertThat(names(response.body())).containsExactly("Moj Kontakt");
    }

    @Test
    @Tag("FR-004-06")
    void groupListsShowTheRealContactCount() throws Exception {
        Scenario s = scenario();
        contacts.insertMany(s.group(), s.id(Who.OWNER), 7);
        UUID archived = groups.createGroup(s.id(Who.OWNER), "Arhiv");
        contacts.insertMany(archived, s.id(Who.OWNER), 3);
        groups.archive(archived);

        Map<String, Object> list =
                json(get("/api/groups?size=100", s.token(Who.OWNER)).body());
        Map<String, Object> archivedList =
                json(get("/api/groups/archived", s.token(Who.OWNER)).body());

        assertThat(contactCountOf(list, s.group().toString())).isEqualTo(7);
        assertThat(contactCountOf(archivedList, archived.toString())).isEqualTo(3);
    }

    private static int contactCountOf(Map<String, Object> body, String groupId) {
        List<Map<String, Object>> found = new ArrayList<>();
        if (body.containsKey("sections")) {
            for (Map<String, Object> section : asObjects(body.get("sections"))) {
                found.addAll(asObjects(section.get("items")));
            }
        } else {
            found.addAll(asObjects(body.get("items")));
        }
        Set<String> ids = new HashSet<>();
        for (Map<String, Object> item : found) {
            ids.add((String) item.get("id"));
            if (groupId.equals(item.get("id"))) {
                return ((Number) item.get("contactCount")).intValue();
            }
        }
        throw new AssertionError("skupina " + groupId + " ni na seznamu: " + ids);
    }

    @Test
    @Tag("FR-004-06")
    void pageOfAHundredFromTenThousandContactsIsServedInUnderTwoSeconds() throws Exception {
        Scenario s = scenario();
        contacts.insertMany(s.group(), s.id(Who.OWNER), 10_000);
        String path = contactsPath(s.group()) + "?page=50&size=100";
        get(path, s.token(Who.VIEWER)); // ogrevanje (povezave, JIT)

        List<Long> millis = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            long start = System.nanoTime();
            HttpResponse<String> response = get(path, s.token(Who.VIEWER));
            millis.add((System.nanoTime() - start) / 1_000_000);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(items(response.body())).hasSize(100);
            assertThat(((Number) json(response.body()).get("total")).longValue())
                    .isEqualTo(10_000);
        }

        assertThat(millis.stream().sorted().toList().get(2))
                .as("mediana ms: " + millis)
                .isLessThan(2000);
    }
}
