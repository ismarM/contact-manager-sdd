package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.contact.support.XlsxReader;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.Http;

/**
 * Slike kontaktov niso del izvoza in uvoza (FR-018-13): Excel, vCard (izbor in en kontakt) in CardDAV kontakta s sliko
 * ne vsebujejo slike in so enaki kot brez nje; uvoz vCard z {@code PHOTO} slike ne ustvari ({@code omitted} ostane
 * {@code PHOTO}).
 */
@Tag("FR-018-13")
class ContactPhotoExportIT extends ImageApiTest {

    private static final HttpClient DAV = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private record Fixture(Scenario s, UUID contact) {}

    private Fixture fixture() throws Exception {
        Scenario s = scenario();
        UUID contact = contacts.insert(
                s.group(), s.id(Who.OWNER), "Ana", "Kos", "ana@primer.si", "041 111 111", "Glavni trg 1\nKranj");
        contacts.addTags(contact, "alumni");
        return new Fixture(s, contact);
    }

    private void addPhoto(Fixture f) throws Exception {
        HttpResponse<String> response = upload(
                contactPhotoPath(f.s().group(), f.contact()), f.s().token(Who.EDITOR), TestImages.jpeg(300, 300), 0L);
        assertThat(response.statusCode()).isEqualTo(200);
    }

    private HttpResponse<byte[]> vcards(Fixture f, List<UUID> ids) throws Exception {
        return send(exportPath(f.s().group()) + "/vcard", f.s().token(Who.VIEWER), body(exportBody(ids, "sl")));
    }

    private String normalized(String vcf) {
        // REV (čas zadnje spremembe), če obstaja, se z dodajanjem slike lahko spremeni; vsebina polj ne
        return vcf.replaceAll("(?m)^REV[^\\r\\n]*\\r?\\n", "");
    }

    @Test
    void excelExportOfAContactWithAPhotoIsTheSameAsWithoutIt() throws Exception {
        Fixture f = fixture();
        HttpResponse<byte[]> before =
                export(f.s().token(Who.VIEWER), f.s().group(), exportBody(List.of(f.contact()), "sl"));
        addPhoto(f);

        HttpResponse<byte[]> after =
                export(f.s().token(Who.VIEWER), f.s().group(), exportBody(List.of(f.contact()), "sl"));

        assertThat(after.statusCode()).isEqualTo(200);
        XlsxReader.Workbook file = workbook(after);
        assertThat(file.rows()).isEqualTo(workbook(before).rows());
        assertThat(file.rows().getFirst())
                .noneMatch(header -> header.toLowerCase().contains("slik")
                        || header.toLowerCase().contains("photo"));
        assertThat(file.columns()).isEqualTo(workbook(before).columns());
        assertThat(new String(after.body(), StandardCharsets.ISO_8859_1)).doesNotContain("JFIF");
    }

    @Test
    void vcardExportOfTheSelectionAndOfOneContactHasNoPhoto() throws Exception {
        Fixture f = fixture();
        String beforeSelection = normalized(text(vcards(f, List.of(f.contact()))));
        String beforeOne = normalized(get(contactPath(f.s().group(), f.contact()) + "/vcard", f.s().token(Who.VIEWER))
                .body());
        addPhoto(f);

        String selection = text(vcards(f, List.of(f.contact())));
        HttpResponse<String> one = get(contactPath(f.s().group(), f.contact()) + "/vcard", f.s().token(Who.VIEWER));

        assertThat(selection).contains("FN:Ana Kos").doesNotContain("PHOTO");
        assertThat(one.statusCode()).isEqualTo(200);
        assertThat(one.body()).contains("FN:Ana Kos").doesNotContain("PHOTO");
        assertThat(normalized(selection)).isEqualTo(beforeSelection);
        assertThat(normalized(one.body())).isEqualTo(beforeOne);
    }

    private HttpResponse<String> dav(String method, String path, String user, String password, String body)
            throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url(path)))
                .timeout(Duration.ofSeconds(60))
                .header(
                        "Authorization",
                        "Basic "
                                + Base64.getEncoder()
                                        .encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8)))
                .method(
                        method,
                        body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) {
            builder.header("Content-Type", "application/xml; charset=utf-8").header("Depth", "1");
        }
        return DAV.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void cardDavCardAndListingOfAContactWithAPhotoHaveNoPhoto() throws Exception {
        Fixture f = fixture();
        Map<String, Object> password =
                json(post("/api/me/app-passwords", f.s().token(Who.VIEWER), "{\"name\":\"Telefon\"}")
                        .body());
        String user = (String) password.get("username");
        String secret = (String) password.get("password");
        String card = "/dav/addressbooks/" + f.s().group() + "/" + f.contact() + ".vcf";
        String propfind = "<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:allprop/></d:propfind>";
        String cardBefore = normalized(dav("GET", card, user, secret, null).body());
        addPhoto(f);

        HttpResponse<String> vcard = dav("GET", card, user, secret, null);
        HttpResponse<String> listing =
                dav("PROPFIND", "/dav/addressbooks/" + f.s().group() + "/", user, secret, propfind);

        assertThat(vcard.statusCode()).isEqualTo(200);
        assertThat(vcard.body()).contains("FN:Ana Kos").doesNotContain("PHOTO");
        assertThat(normalized(vcard.body())).isEqualTo(cardBefore);
        assertThat(listing.statusCode()).isEqualTo(207);
        assertThat(listing.body()).doesNotContain("PHOTO").doesNotContain("JFIF");
    }

    @Test
    void importingAVcardWithAPhotoOmitsItAndCreatesNoImage() throws Exception {
        Scenario s = scenario();
        String photo = Base64.getEncoder().encodeToString(TestImages.jpeg(64, 64));
        String vcf = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Uvožena\r\nN:Uvožena;Ana;;;\r\nPHOTO;ENCODING=b;TYPE=JPEG:"
                + photo + "\r\nEND:VCARD\r\n";

        HttpResponse<String> parsed =
                parse(s.token(Who.EDITOR), s.group(), vcf.getBytes(StandardCharsets.UTF_8), "VCF", "sl");

        assertThat(parsed.statusCode()).as(parsed.body()).isEqualTo(200);
        Map<String, Object> body = json(parsed.body());
        assertThat(asStrings(body.get("omitted"))).containsExactly("PHOTO");
        Map<String, Object> candidate = asObjects(body.get("candidates")).get(0);
        assertThat(candidate.keySet()).noneMatch(key -> key.toLowerCase().contains("photo"));
        candidate.put("country", candidate.remove("countryText"));
        HttpResponse<String> created = commit(s.token(Who.EDITOR), s.group(), "VCF", List.of(candidate));
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(contacts.count(s.group())).isEqualTo(1);
        assertThat(imageCountForGroup(s.group())).isZero();
        Map<String, Object> listed = asObjects(
                        json(get(contactsPath(s.group()), s.token(Who.VIEWER)).body())
                                .get("items"))
                .get(0);
        assertThat(listed).containsEntry("photoRevision", null);
    }

    @Test
    void exportAndImportEndpointsNeverTouchStoredPhotos() throws Exception {
        Fixture f = fixture();
        addPhoto(f);
        Long revision = revisionOf("kind = 'CONTACT' and contact_id = ?", f.contact());
        long version = contacts.version(f.contact());

        export(f.s().token(Who.VIEWER), f.s().group(), exportBody(List.of(f.contact()), "sl"));
        vcards(f, List.of(f.contact()));
        Http.send("GET", url(contactPath(f.s().group(), f.contact()) + "/vcard"), Http.bearer(f.s().token(Who.VIEWER)));

        assertThat(revisionOf("kind = 'CONTACT' and contact_id = ?", f.contact()))
                .isEqualTo(revision);
        assertThat(contacts.version(f.contact())).isEqualTo(version);
        assertThat(imageCountForGroup(f.s().group())).isEqualTo(1);
    }
}
