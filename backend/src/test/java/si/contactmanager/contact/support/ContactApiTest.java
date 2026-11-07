package si.contactmanager.contact.support;

import java.net.http.HttpResponse;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import si.contactmanager.group.support.GroupFixtures;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/** Osnova testov kontaktov: skupina s po enim članom vsake vloge in nečlanom ter pomočniki za zahtevke. */
public abstract class ContactApiTest extends ApiTest {

    /** Vloge članov v testni skupini. */
    public enum Who {
        OWNER,
        ADMIN,
        EDITOR,
        VIEWER,
        NON_MEMBER
    }

    /** Testna skupina z uporabniki po vlogah. */
    public record Scenario(UUID group, Map<Who, SignedIn> users, Map<Who, Long> ids) {

        public String token(Who who) {
            return users.get(who).idToken();
        }

        public long id(Who who) {
            return ids.get(who);
        }
    }

    protected GroupFixtures groups;
    protected ContactFixtures contacts;

    @BeforeEach
    void setUpFixtures() {
        groups = new GroupFixtures(jdbc);
        contacts = new ContactFixtures(jdbc);
    }

    /** Nova skupina »Projekt FERI« z lastnikom, adminom, urednikom, bralcem in nečlanom. */
    protected Scenario scenario() throws Exception {
        Map<Who, SignedIn> users = new EnumMap<>(Who.class);
        Map<Who, Long> ids = new EnumMap<>(Who.class);
        for (Who who : Who.values()) {
            SignedIn user = registeredUser(who.name());
            users.put(who, user);
            ids.put(who, groups.userId(user.uid()));
        }
        UUID group = groups.createGroup(ids.get(Who.OWNER), "Projekt FERI", null, "mah");
        for (Who who : List.of(Who.ADMIN, Who.EDITOR, Who.VIEWER)) {
            groups.addMember(group, ids.get(who), who.name());
        }
        return new Scenario(group, users, ids);
    }

    protected HttpResponse<String> delete(String path, String token) throws Exception {
        return Http.send("DELETE", url(path), token == null ? Map.of() : Http.bearer(token));
    }

    protected static String body(Object value) {
        return JSON.writeValueAsString(value);
    }

    protected static String contactsPath(UUID group) {
        return "/api/groups/" + group + "/contacts";
    }

    protected static String contactPath(UUID group, Object contact) {
        return contactsPath(group) + "/" + contact;
    }

    /** Veljavno telo za ustvarjanje: ime in priimek. */
    protected static Map<String, Object> input(String firstName, String lastName) {
        Map<String, Object> input = new java.util.LinkedHashMap<>();
        input.put("firstName", firstName);
        input.put("lastName", lastName);
        return input;
    }

    /** Ustvari kontakt prek API-ja kot urednik; vrne razčlenjen odgovor. */
    protected Map<String, Object> createViaApi(Scenario s, Map<String, Object> input) throws Exception {
        HttpResponse<String> response = post(contactsPath(s.group()), s.token(Who.EDITOR), body(input));
        if (response.statusCode() != 201) {
            throw new IllegalStateException("POST contacts vrnil " + response.statusCode() + ": " + response.body());
        }
        return json(response.body());
    }

    /** Telo za urejanje: vrednosti iz {@code input} in {@code version}. */
    protected static Map<String, Object> withVersion(Map<String, Object> input, long version) {
        Map<String, Object> copy = new java.util.LinkedHashMap<>(input);
        copy.put("version", version);
        return copy;
    }

    private static final tools.jackson.databind.json.JsonMapper MAPPER =
            tools.jackson.databind.json.JsonMapper.builder().build();

    /** Vrednost iz razčlenjenega JSON kot objekt (brez nepreverjenih pretvorb). */
    protected static Map<String, Object> asObject(Object value) {
        return MAPPER.convertValue(value, new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
    }

    /** Vrednost iz razčlenjenega JSON kot seznam objektov. */
    protected static List<Map<String, Object>> asObjects(Object value) {
        return MAPPER.convertValue(value, new tools.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
    }

    /** Vrednost iz razčlenjenega JSON kot seznam nizov. */
    protected static List<String> asStrings(Object value) {
        return MAPPER.convertValue(value, new tools.jackson.core.type.TypeReference<List<String>>() {});
    }

    /** Seznam napak {@code field → code} iz telesa {@code 400}. */
    protected static Map<String, String> fieldErrors(String responseBody) {
        Map<String, String> errors = new java.util.LinkedHashMap<>();
        for (Map<String, Object> error : asObjects(json(responseBody).get("errors"))) {
            errors.putIfAbsent((String) error.get("field"), (String) error.get("code"));
        }
        return errors;
    }
}
