package si.contactmanager.apikey.support;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import si.contactmanager.apikey.ApiKeyTokens;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;
import si.contactmanager.support.ApiKeys;
import si.contactmanager.support.Http;

/** Osnova testov operacij {@code /v1}: scenarij skupine iz 004 in API ključi (vrstica + podpisan žeton) za člane. */
public abstract class ApiV1Test extends ContactApiTest {

    @Autowired
    ApiKeyTokens tokens;

    protected ApiKeys keys() {
        return new ApiKeys(tokens, jdbc);
    }

    /** Ključ člana (po vlogi v scenariju) za dane skupine z dano pravico. */
    protected String keyFor(Scenario s, Who who, Permission permission, UUID... groups) {
        return keys().forGroups(s.id(who), permission, groups).token();
    }

    /** Ključ člana »vse moje skupine« z dano pravico. */
    protected String allKey(Scenario s, Who who, Permission permission) {
        return keys().create(s.id(who), "Vse skupine", Scope.allGroups(permission))
                .token();
    }

    protected HttpResponse<String> v1(String method, String path, String key, String body) throws Exception {
        Map<String, String> headers = key == null ? Map.of() : Http.bearer(key);
        return body == null ? Http.send(method, url(path), headers) : Http.send(method, url(path), headers, body);
    }

    protected HttpResponse<String> v1(String method, String path, String key) throws Exception {
        return v1(method, path, key, null);
    }

    protected static String groupsV1() {
        return "/v1/groups";
    }

    protected static String contactsV1(UUID group) {
        return "/v1/groups/" + group + "/contacts";
    }

    protected static String contactV1(UUID group, Object contact) {
        return contactsV1(group) + "/" + contact;
    }
}
