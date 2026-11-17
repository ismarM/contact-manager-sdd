package si.contactmanager.image.support;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import si.contactmanager.contact.support.ImportApiTest;
import si.contactmanager.support.Http;

/**
 * Osnova testov slik (018): skupina po vlogah iz {@link ContactApiTest}, nalaganje {@code multipart/form-data},
 * dvojiški prenos slike in poizvedbe po tabelah {@code image} in {@code image_variant}.
 */
public abstract class ImageApiTest extends ImportApiTest {

    private static final HttpClient CLIENT =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    /** Del obrazca: ime polja, neobvezno ime datoteke in vrsta vsebine, vsebina. */
    public record Part(String name, String filename, String contentType, byte[] content) {

        public static Part file(byte[] content) {
            return new Part("file", "slika.jpg", "image/jpeg", content);
        }

        public static Part file(String filename, String contentType, byte[] content) {
            return new Part("file", filename, contentType, content);
        }

        public static Part field(String name, String value) {
            return new Part(name, null, null, value.getBytes(StandardCharsets.UTF_8));
        }
    }

    /** Zahtevek {@code multipart/form-data} z danimi deli; {@code token == null} = brez prijave. */
    protected HttpResponse<String> multipart(String method, String path, String token, List<Part> parts)
            throws IOException, InterruptedException {
        Map<String, String> headers = new HashMap<>(token == null ? Map.of() : Http.bearer(token));
        return multipart(method, path, headers, parts);
    }

    protected HttpResponse<String> multipart(String method, String path, Map<String, String> headers, List<Part> parts)
            throws IOException, InterruptedException {
        String boundary = "----slike" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        for (Part part : parts) {
            StringBuilder head = new StringBuilder("--").append(boundary).append("\r\n");
            head.append("Content-Disposition: form-data; name=\"")
                    .append(part.name())
                    .append('"');
            if (part.filename() != null) {
                head.append("; filename=\"").append(part.filename()).append('"');
            }
            head.append("\r\n");
            if (part.contentType() != null) {
                head.append("Content-Type: ").append(part.contentType()).append("\r\n");
            }
            head.append("\r\n");
            body.writeBytes(head.toString().getBytes(StandardCharsets.UTF_8));
            body.writeBytes(part.content());
            body.writeBytes("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        body.writeBytes(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .method(method, HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()));
        headers.forEach(builder::header);
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    /** Nalaganje slike (JPEG) z verzijo skupine ali kontakta ({@code version == null}: brez dela {@code version}). */
    protected HttpResponse<String> upload(String path, String token, byte[] file, Long version) throws Exception {
        List<Part> parts = new ArrayList<>();
        parts.add(Part.file(file));
        if (version != null) {
            parts.add(Part.field("version", Long.toString(version)));
        }
        return multipart("PUT", path, token, parts);
    }

    /** Nalaganje na {@code PUT /api/me/photo}. */
    protected HttpResponse<String> uploadMe(String token, byte[] file) throws Exception {
        return multipart("PUT", "/api/me/photo", token, List.of(Part.file(file)));
    }

    /** Prenos slike kot bajti ({@code token == null} = brez prijave). */
    protected HttpResponse<byte[]> download(String path, String token, Map<String, String> extraHeaders)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(30))
                .GET();
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        extraHeaders.forEach(builder::header);
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    protected HttpResponse<byte[]> download(String path, String token) throws IOException, InterruptedException {
        return download(path, token, Map.of());
    }

    /** Število vrstic {@code image} z danim pogojem (vstavljen neposredno v SQL, samo za teste). */
    protected int imageCount(String where, Object... args) {
        Integer count = jdbc.queryForObject("select count(*) from image where " + where, Integer.class, args);
        return count == null ? 0 : count;
    }

    protected int imageCountForGroup(UUID group) {
        return imageCount("group_id = ?", group);
    }

    protected Long revisionOf(String where, Object... args) {
        List<Long> rows = jdbc.queryForList("select revision from image where " + where, Long.class, args);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    /** Skupina podatkov o sliki kontakta v bazi: revizija in {@code detached_at} (prazno, če vrstice ni). */
    protected Map<String, Object> contactImageRow(UUID group, UUID contact) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select revision, detached_at from image where kind = 'CONTACT' and group_id = ? and contact_id = ?",
                group,
                contact);
        return rows.isEmpty() ? null : new LinkedHashMap<>(rows.getFirst());
    }

    /** Vnosi sledi skupine po {@code seq} naraščajoče z dejstvom spremembe slike ({@code photo_change}). */
    protected List<Map<String, Object>> auditEntries(UUID group) {
        return jdbc.queryForList(
                "select id, seq, action, actor_id, contact_count, contact_name, photo_change, target_entry_id"
                        + " from audit_entry where group_id = ? order by seq",
                group);
    }

    /** Slika kontakta neposredno v bazi (brez omejitve nalaganj): ena vrstica {@code image} in različica 96. */
    protected void seedContactImages(UUID group, List<UUID> contactIds) {
        for (UUID contact : contactIds) {
            jdbc.update("insert into image (kind, group_id, contact_id) values ('CONTACT', ?, ?)", group, contact);
        }
        jdbc.update(
                "insert into image_variant (image_id, size, content_type, data)"
                        + " select i.id, 96, 'image/jpeg', ?::bytea from image i where i.kind = 'CONTACT'"
                        + " and i.group_id = ? and not exists (select 1 from image_variant v where v.image_id = i.id)",
                new byte[] {1, 2, 3},
                group);
    }

    protected static UUID idOf(Map<String, Object> detail) {
        return UUID.fromString((String) detail.get("id"));
    }

    protected static String photoPath(UUID group) {
        return "/api/groups/" + group + "/photo";
    }

    protected static String contactPhotoPath(UUID group, Object contact) {
        return contactPath(group, contact) + "/photo";
    }

    /** Invarianta življenjskega cikla (plan.md dopolnitev 2): slika kontakta je priklopljena natanko tedaj, ko kontakt obstaja. */
    protected void assertContactImageInvariant() {
        List<Map<String, Object>> violations =
                jdbc.queryForList("select i.id, i.group_id, i.contact_id, i.detached_at is null as attached,"
                        + " exists (select 1 from contact c where c.group_id = i.group_id and c.id = i.contact_id)"
                        + " as present from image i where i.kind = 'CONTACT'");
        for (Map<String, Object> row : violations) {
            if (!row.get("attached").equals(row.get("present"))) {
                throw new AssertionError("kršena invarianta slike kontakta: " + row);
            }
        }
        Integer orphans = jdbc.queryForObject(
                "select count(*) from image i where (i.kind = 'USER' and not exists"
                        + " (select 1 from app_user u where u.id = i.user_id))"
                        + " or (i.kind in ('GROUP', 'CONTACT') and not exists"
                        + " (select 1 from contact_group g where g.id = i.group_id))",
                Integer.class);
        if (orphans != null && orphans > 0) {
            throw new AssertionError("slike brez lastnika: " + orphans);
        }
    }
}
