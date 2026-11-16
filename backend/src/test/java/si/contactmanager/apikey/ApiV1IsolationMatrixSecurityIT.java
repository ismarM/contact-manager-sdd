package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import si.contactmanager.apikey.support.ApiV1Test;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys.Key;
import si.contactmanager.support.Http;

/**
 * Matrika izolacije operacij {@code /v1} (019, konstitucija III in §3.1; FR-019-06 do -09, -10, -13, -17): vsak
 * endpoint × akter (401 brez veljavnega ključa, 404 nečlan in izven obsega, 403 vloga ali ključ samo za branje, 2xx,
 * 409 arhivirana). Vrstni red: 401 → 404 (nečlan) → 404 (izven obsega) → 403 → 409.
 */
@Tag("FR-019-06")
@Tag("FR-019-07")
@Tag("FR-019-08")
@Tag("FR-019-09")
@Tag("FR-019-10")
@Tag("FR-019-13")
@Tag("FR-019-17")
class ApiV1IsolationMatrixSecurityIT extends ApiV1Test {

    /** Akterji 401: vsak dobi svoj (neveljaven) ključ. */
    enum Unauthenticated {
        NO_KEY,
        MALFORMED_KEY,
        FIREBASE_TOKEN,
        FORGED_SIGNATURE,
        OTHER_SIGNING_SECRET,
        EXPIRED_KEY,
        REVOKED_KEY,
        KEY_WITHOUT_ROW,
        DELETED_ACCOUNT
    }

    /** Stanje skupine. */
    enum State {
        ACTIVE,
        ARCHIVED,
        PERMANENTLY_ARCHIVED
    }

    @FunctionalInterface
    interface Call {
        HttpResponse<String> send(String key) throws Exception;
    }

    /** Vloga člana s pravico ključa. */
    record Member(Who who, Permission permission) {
        @Override
        public String toString() {
            return who + "/" + permission;
        }
    }

    /** Neveljaven ključ za akterja; {@code null} pomeni brez glave. */
    private String invalidKey(Unauthenticated actor, Scenario s) throws Exception {
        Scope all = Scope.allGroups(Permission.WRITE);
        long owner = s.id(Who.OWNER);
        return switch (actor) {
            case NO_KEY -> null;
            case MALFORMED_KEY -> "cmk_ni-zeton";
            case FIREBASE_TOKEN -> s.token(Who.OWNER);
            case FORGED_SIGNATURE -> {
                String[] parts = keys().create(owner, "Ponarejen", all).token().split("\\.");
                yield parts[0] + "." + parts[1] + "."
                        + Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[32]);
            }
            case OTHER_SIGNING_SECRET ->
                keys().signedWithOtherSecret(owner, all).token();
            case EXPIRED_KEY -> keys().expired(owner, all).token();
            case REVOKED_KEY -> keys().revoked(owner, all).token();
            case KEY_WITHOUT_ROW -> keys().withoutRow(owner, all);
            case DELETED_ACCOUNT -> {
                Long deleted = jdbc.queryForObject(
                        "insert into app_user (firebase_uid, email) values (?, ?) returning id",
                        Long.class,
                        "uid-" + UUID.randomUUID(),
                        uniqueEmail());
                Key key = keys().create(deleted, "Izbrisan račun", all);
                jdbc.update("delete from app_user where id = ?", deleted);
                yield key.token();
            }
        };
    }

    private void assertUnauthenticated(Unauthenticated actor, Scenario s, Call call) throws Exception {
        HttpResponse<String> response = call.send(invalidKey(actor, s));

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(Http.compact(response.body())).isEqualTo("{\"code\":\"UNAUTHENTICATED\"}");
    }

    private static void assertNotFound(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).isEmpty();
    }

    private void apply(Scenario s, State state) {
        switch (state) {
            case ACTIVE -> {}
            case ARCHIVED -> groups.archive(s.group());
            case PERMANENTLY_ARCHIVED -> groups.makePermanentlyArchived(s.group());
        }
    }

    /** Člani, ki v stanju še obstajajo (trajno arhivirana skupina nima lastnika). */
    private static List<Who> members(State state) {
        return state == State.PERMANENTLY_ARCHIVED
                ? List.of(Who.ADMIN, Who.EDITOR, Who.VIEWER)
                : List.of(Who.OWNER, Who.ADMIN, Who.EDITOR, Who.VIEWER);
    }

    /** Vsak član × pravica ključa × stanje skupine. */
    static Stream<Arguments> memberStates() {
        List<Arguments> rows = new ArrayList<>();
        for (State state : State.values()) {
            for (Who who : members(state)) {
                for (Permission permission : Permission.values()) {
                    rows.add(Arguments.of(state, new Member(who, permission)));
                }
            }
        }
        return rows.stream();
    }

    // --- GET /v1/groups (T018) ---

    @ParameterizedTest(name = "GET /v1/groups, {0}")
    @EnumSource(Unauthenticated.class)
    void listGroupsIsUnauthenticatedWithoutAValidKey(Unauthenticated actor) throws Exception {
        Scenario s = scenario();

        assertUnauthenticated(actor, s, key -> v1("GET", groupsV1(), key));
    }

    @ParameterizedTest(name = "GET /v1/groups, {0} {1}")
    @MethodSource("memberStates")
    void listGroupsContainsTheGroupInEveryStateForEveryRoleAndPermission(State state, Member member) throws Exception {
        Scenario s = scenario();
        apply(s, state);

        HttpResponse<String> response = v1("GET", groupsV1(), keyFor(s, member.who(), member.permission(), s.group()));

        assertThat(response.statusCode()).isEqualTo(200);
        List<Map<String, Object>> items = asObjects(json(response.body()).get("items"));
        assertThat(items).hasSize(1);
        assertThat(items.getFirst())
                .containsEntry("id", s.group().toString())
                .containsEntry("archived", state != State.ACTIVE)
                .containsEntry("role", member.who().name());
    }

    @Test
    void listGroupsOmitsGroupsOutsideTheKeyScopeAndForNonMembers() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.VIEWER), "Samo bralec");
        String key = keyFor(s, Who.VIEWER, Permission.WRITE, other);

        HttpResponse<String> response = v1("GET", groupsV1(), key);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items")))
                .extracting(item -> item.get("id"))
                .containsExactly(other.toString());
        String nonMember = keyFor(s, Who.NON_MEMBER, Permission.READ, s.group());
        HttpResponse<String> empty = v1("GET", groupsV1(), nonMember);
        assertThat(empty.statusCode()).isEqualTo(200);
        assertThat(json(empty.body())).containsEntry("total", 0);
        assertThat(asObjects(json(empty.body()).get("items"))).isEmpty();
    }

    @Test
    void allMyGroupsKeyListsEveryGroupOfTheUserIncludingArchivedAndPermanentlyArchived() throws Exception {
        Scenario s = scenario();
        UUID archived = groups.createGroup(s.id(Who.ADMIN), "Arhivirana");
        groups.archive(archived);
        UUID permanent = groups.createGroup(s.id(Who.OWNER), "Trajno");
        groups.addMember(permanent, s.id(Who.ADMIN), "ADMIN");
        groups.makePermanentlyArchived(permanent);

        HttpResponse<String> response = v1("GET", groupsV1(), allKey(s, Who.ADMIN, Permission.READ));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items")))
                .extracting(item -> item.get("id"))
                .containsExactlyInAnyOrder(s.group().toString(), archived.toString(), permanent.toString());
    }

    // --- GET /v1/groups/{groupId}/contacts (T019) ---

    @ParameterizedTest(name = "GET contacts, {0}")
    @EnumSource(Unauthenticated.class)
    void listContactsIsUnauthenticatedWithoutAValidKey(Unauthenticated actor) throws Exception {
        Scenario s = scenario();

        assertUnauthenticated(actor, s, key -> v1("GET", contactsV1(s.group()), key));
    }

    @ParameterizedTest(name = "GET contacts, {0} {1}")
    @MethodSource("memberStates")
    void listContactsIs200ForEveryRoleAndPermissionInEveryState(State state, Member member) throws Exception {
        Scenario s = scenario();
        contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        apply(s, state);

        HttpResponse<String> response =
                v1("GET", contactsV1(s.group()), keyFor(s, member.who(), member.permission(), s.group()));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(asObjects(json(response.body()).get("items"))).hasSize(1);
    }

    @Test
    void listContactsIsNotFoundForNonMemberUnknownInvalidAndOutOfScopeGroups() throws Exception {
        Scenario s = scenario();
        UUID other = groups.createGroup(s.id(Who.VIEWER), "Druga");
        contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        // nečlan (ključ za skupino, katere ni član)
        assertNotFound(v1("GET", contactsV1(s.group()), keyFor(s, Who.NON_MEMBER, Permission.READ, s.group())));
        // neobstoječa in neveljaven id (ključ »vse skupine«)
        String all = allKey(s, Who.VIEWER, Permission.WRITE);
        assertNotFound(v1("GET", contactsV1(UUID.randomUUID()), all));
        assertNotFound(v1("GET", "/v1/groups/not-a-uuid/contacts", all));
        // član, a skupina izven obsega ključa
        assertNotFound(v1("GET", contactsV1(s.group()), keyFor(s, Who.VIEWER, Permission.WRITE, other)));
    }

    @Test
    void listContactsOfARemovedMemberIs404AndWorksAgainAfterRejoining() throws Exception {
        Scenario s = scenario();
        String key = keyFor(s, Who.EDITOR, Permission.WRITE, s.group());
        assertThat(v1("GET", contactsV1(s.group()), key).statusCode()).isEqualTo(200);

        jdbc.update("delete from group_member where group_id = ? and user_id = ?", s.group(), s.id(Who.EDITOR));
        assertNotFound(v1("GET", contactsV1(s.group()), key));

        groups.addMember(s.group(), s.id(Who.EDITOR), "VIEWER");
        assertThat(v1("GET", contactsV1(s.group()), key).statusCode()).isEqualTo(200);
    }

    // --- GET /v1/groups/{groupId}/contacts/{contactId} (T020) ---

    @ParameterizedTest(name = "GET contact, {0}")
    @EnumSource(Unauthenticated.class)
    void getContactIsUnauthenticatedWithoutAValidKey(Unauthenticated actor) throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");

        assertUnauthenticated(actor, s, key -> v1("GET", contactV1(s.group(), contact), key));
    }

    @ParameterizedTest(name = "GET contact, {0} {1}")
    @MethodSource("memberStates")
    void getContactIs200ForEveryRoleAndPermissionInEveryState(State state, Member member) throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        apply(s, state);

        HttpResponse<String> response =
                v1("GET", contactV1(s.group(), contact), keyFor(s, member.who(), member.permission(), s.group()));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsEntry("id", contact.toString());
    }

    @Test
    void getContactIsNotFoundForNonMemberOutOfScopeOtherGroupAndUnknownContact() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(s.group(), s.id(Who.OWNER), "Janez", "Novak");
        UUID other = groups.createGroup(s.id(Who.VIEWER), "Druga");
        groups.addMember(other, s.id(Who.OWNER), "VIEWER");
        UUID foreign = contacts.insert(other, s.id(Who.OWNER), "Tuj", "Kontakt");

        assertNotFound(v1("GET", contactV1(s.group(), contact), keyFor(s, Who.NON_MEMBER, Permission.READ, s.group())));
        assertNotFound(v1("GET", contactV1(s.group(), contact), keyFor(s, Who.VIEWER, Permission.WRITE, other)));
        String both = keyFor(s, Who.VIEWER, Permission.WRITE, s.group(), other);
        assertNotFound(v1("GET", contactV1(s.group(), foreign), both));
        assertNotFound(v1("GET", contactV1(s.group(), UUID.randomUUID()), both));
        assertNotFound(v1("GET", contactV1(s.group(), "not-a-uuid"), both));
    }
}
