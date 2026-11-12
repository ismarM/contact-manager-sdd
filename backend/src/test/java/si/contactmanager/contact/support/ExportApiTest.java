package si.contactmanager.contact.support;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Osnova testov izvoza v Excel (010, plan.md – Public Interfaces): zahtevek na {@code POST …/contacts/export}, ki vrne
 * telo kot bajte (datoteka {@code .xlsx}), in telo zahtevka. »Izvoz je branje« se preverja z {@link #snapshot(UUID)} in
 * {@link #assertUnchanged(Snapshot, Snapshot)} iz {@link BulkApiTest} (verzije kontaktov in število vnosov sledi).
 */
public abstract class ExportApiTest extends BulkApiTest {

    public static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    protected static String exportPath(UUID group) {
        return contactsPath(group) + "/export";
    }

    /** Telo zahtevka: {@code contactIds}, neobvezna {@code sort} in {@code dir} ({@code null} = izpuščeno) ter {@code language}. */
    protected static Map<String, Object> exportBody(
            Collection<UUID> contactIds, String sort, String dir, String language) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("contactIds", ids(contactIds));
        if (sort != null) {
            body.put("sort", sort);
        }
        if (dir != null) {
            body.put("dir", dir);
        }
        body.put("language", language);
        return body;
    }

    protected static Map<String, Object> exportBody(Collection<UUID> contactIds, String language) {
        return exportBody(contactIds, null, null, language);
    }

    /** {@code POST …/contacts/export}; telo zahtevka je JSON (niz ali predmet), odgovor je telo kot bajti. */
    protected HttpResponse<byte[]> export(String token, UUID group, Object requestBody) throws Exception {
        String json = requestBody instanceof String text ? text : body(requestBody);
        return send(exportPath(group), token, json);
    }

    protected HttpResponse<byte[]> send(String path, String token, String json)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(180))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    /** Telo odgovora kot besedilo (napake so JSON). */
    protected static String text(HttpResponse<byte[]> response) {
        return new String(response.body(), java.nio.charset.StandardCharsets.UTF_8);
    }

    /** Prebrana datoteka iz uspešnega odgovora. */
    protected static XlsxReader.Workbook workbook(HttpResponse<byte[]> response) {
        return XlsxReader.read(response.body());
    }

    /** Stanje skupine pred/po izvozu (FR-010-14): verzije vseh kontaktov, značke, atributi in število vnosov sledi. */
    protected Snapshot readOnlySnapshot(UUID group) {
        return snapshot(group);
    }
}
