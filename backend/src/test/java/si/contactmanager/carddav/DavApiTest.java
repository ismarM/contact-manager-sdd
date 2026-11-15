package si.contactmanager.carddav;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import si.contactmanager.contact.support.ContactApiTest;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/**
 * Osnova testov CardDAV (014, contracts/carddav.md): geslo za aplikacijo prek {@code POST /api/me/app-passwords} in
 * zahtevki WebDAV s HTTP Basic (e-naslov računa + geslo).
 */
abstract class DavApiTest extends ContactApiTest {

    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    static final String PROPFIND_ALL = "<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:allprop/></d:propfind>";

    /** Poverilnice CardDAV: e-naslov računa in geslo za aplikacijo. */
    record Credentials(String email, String password) {}

    Credentials appPassword(SignedIn user) throws Exception {
        HttpResponse<String> created = post("/api/me/app-passwords", user.idToken(), "{\"name\":\"Telefon\"}");
        if (created.statusCode() != 201) {
            throw new IllegalStateException("geslo: " + created.statusCode() + " " + created.body());
        }
        Map<String, Object> body = json(created.body());
        return new Credentials((String) body.get("username"), (String) body.get("password"));
    }

    HttpResponse<String> dav(
            String method, String path, Credentials credentials, String body, Map<String, String> headers)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(60))
                .method(
                        method,
                        body == null
                                ? HttpRequest.BodyPublishers.noBody()
                                : HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (body != null) {
            builder.header("Content-Type", "application/xml; charset=utf-8");
        }
        if (credentials != null) {
            builder.header("Authorization", basic(credentials.email(), credentials.password()));
        }
        headers.forEach(builder::header);
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    HttpResponse<String> propfind(String path, Credentials credentials, String depth) throws Exception {
        return dav("PROPFIND", path, credentials, PROPFIND_ALL, Map.of("Depth", depth));
    }

    HttpResponse<String> report(String path, Credentials credentials, String body) throws Exception {
        return dav("REPORT", path, credentials, body, Map.of("Depth", "1"));
    }

    static String basic(String user, String password) {
        return "Basic " + Base64.getEncoder().encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));
    }

    static String book(Object group) {
        return "/dav/addressbooks/" + group + "/";
    }

    static String card(Object group, Object contact) {
        return book(group) + contact + ".vcf";
    }

    static String syncCollection(String token) {
        return "<?xml version=\"1.0\"?><d:sync-collection xmlns:d=\"DAV:\"><d:sync-token>" + token
                + "</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>";
    }

    /** Vrednost prvega elementa {@code <ns:name>…</ns:name>} v odgovoru (brez razčlenjevanja XML). */
    static String element(String xml, String qualified) {
        int start = xml.indexOf("<" + qualified + ">");
        if (start < 0) {
            return null;
        }
        int from = start + qualified.length() + 2;
        return xml.substring(from, xml.indexOf("</" + qualified + ">", from));
    }
}
