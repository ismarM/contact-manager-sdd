package si.contactmanager.contact.support;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;

/**
 * Osnova testov uvoza in izvoza vCard (014, plan.md – Public Interfaces): zahtevki multipart na {@code …/imports/parse},
 * JSON na {@code …/imports/preview} in {@code …/imports}, izdelava datotek {@code .xlsx} s fastexcel.
 */
public abstract class ImportApiTest extends ExportApiTest {

    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    protected static String importsPath(UUID group) {
        return "/api/groups/" + group + "/imports";
    }

    /** Datoteka {@code .xlsx}: prvi seznam je glava, ostali vrstice; {@code null} = prazna celica. */
    protected static byte[] xlsx(List<List<String>> rows) throws IOException {
        return xlsx(rows, 1);
    }

    protected static byte[] xlsx(List<List<String>> rows, int sheets) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Workbook workbook = new Workbook(out, "test", "1.0");
        Worksheet sheet = workbook.newWorksheet("List1");
        for (int r = 0; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            for (int c = 0; c < row.size(); c++) {
                if (row.get(c) != null) {
                    sheet.value(r, c, row.get(c));
                }
            }
        }
        for (int i = 2; i <= sheets; i++) {
            workbook.newWorksheet("List" + i).value(0, 0, "x");
        }
        workbook.finish();
        return out.toByteArray();
    }

    /** {@code POST …/imports/parse} (multipart); {@code format}/{@code language} {@code null} = izpuščeno. */
    protected HttpResponse<String> parse(String token, UUID group, byte[] file, String format, String language)
            throws IOException, InterruptedException {
        String boundary = "----cm" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        if (file != null) {
            body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"datoteka\"\r\n"
                            + "Content-Type: application/octet-stream\r\n\r\n")
                    .getBytes(StandardCharsets.UTF_8));
            body.write(file);
            body.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        Map<String, String> fields = new LinkedHashMap<>();
        if (format != null) {
            fields.put("format", format);
        }
        if (language != null) {
            fields.put("language", language);
        }
        for (Map.Entry<String, String> field : fields.entrySet()) {
            body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + field.getKey() + "\"\r\n\r\n"
                            + field.getValue() + "\r\n")
                    .getBytes(StandardCharsets.UTF_8));
        }
        body.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(importsPath(group) + "/parse")))
                .timeout(Duration.ofSeconds(120))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()));
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    protected HttpResponse<String> preview(String token, UUID group, List<Map<String, Object>> candidates)
            throws IOException, InterruptedException {
        return post(importsPath(group) + "/preview", token, body(Map.of("candidates", candidates)));
    }

    protected HttpResponse<String> commit(String token, UUID group, String source, List<Map<String, Object>> contacts)
            throws IOException, InterruptedException {
        return post(importsPath(group), token, body(Map.of("source", source, "contacts", contacts)));
    }

    /** Kontakt za potrditev ali kandidat za predogled z imenom in priimkom. */
    protected static Map<String, Object> person(String first, String last) {
        Map<String, Object> contact = new LinkedHashMap<>();
        contact.put("firstName", first);
        contact.put("lastName", last);
        return contact;
    }
}
