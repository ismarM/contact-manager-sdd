package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;

/**
 * Zloraba nalaganja prek vseh treh končnih točk (FR-018-14, FR-018-15): del {@code file} manjka ali je podvojen, lažna
 * vsebina pod pravim tipom ali končnico, 5 MB + 1 bajt in omejitev 10 nalaganj na minuto (11. je {@code 429
 * RATE_LIMITED}). Odgovori so 400 ali 429, stanje baze se ne spremeni.
 */
@Tag("FR-018-14")
@Tag("FR-018-15")
class ImageUploadAbuseIT extends ImageApiTest {

    enum Target {
        ME,
        GROUP,
        CONTACT
    }

    private record Setup(Scenario s, UUID contact) {}

    private Setup setup() throws Exception {
        Scenario s = scenario();
        return new Setup(s, idOf(createViaApi(s, input("Janez", "Novak"))));
    }

    private String path(Target target, Setup setup) {
        return switch (target) {
            case ME -> "/api/me/photo";
            case GROUP -> photoPath(setup.s().group());
            case CONTACT -> contactPhotoPath(setup.s().group(), setup.contact());
        };
    }

    private String token(Target target, Setup setup) {
        return setup.s().token(target == Target.GROUP ? Who.ADMIN : Who.EDITOR);
    }

    private List<Part> parts(Target target, Part... parts) {
        List<Part> all = new ArrayList<>(List.of(parts));
        if (target != Target.ME) {
            all.add(Part.field("version", "0"));
        }
        return all;
    }

    private int storedImages() {
        return imageCount("true");
    }

    @ParameterizedTest
    @EnumSource(Target.class)
    void malformedFilePartsAreRejectedAndChangeNothing(Target target) throws Exception {
        Setup setup = setup();
        byte[] valid = TestImages.jpeg(100, 100);
        int before = storedImages();

        HttpResponse<String> none = multipart("PUT", path(target, setup), token(target, setup), parts(target));
        HttpResponse<String> two = multipart(
                "PUT", path(target, setup), token(target, setup), parts(target, Part.file(valid), Part.file(valid)));
        HttpResponse<String> wrongName = multipart(
                "PUT",
                path(target, setup),
                token(target, setup),
                parts(target, new Part("slika", "slika.jpg", "image/jpeg", valid)));
        HttpResponse<String> notMultipart = si.contactmanager.support.Http.send(
                "PUT",
                url(path(target, setup)),
                si.contactmanager.support.Http.bearer(token(target, setup)),
                "{\"file\":\"abc\"}");

        assertThat(none.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(none.body())).containsEntry("file", "REQUIRED");
        assertThat(two.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(two.body())).containsKey("file");
        assertThat(wrongName.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(wrongName.body())).containsEntry("file", "REQUIRED");
        assertThat(notMultipart.statusCode()).isEqualTo(400);
        // brez obrazca ni niti dela version (skupina, kontakt) niti dela file
        assertThat(fieldErrors(notMultipart.body())).containsKey(target == Target.ME ? "file" : "version");
        assertThat(storedImages()).isEqualTo(before);
    }

    @ParameterizedTest
    @EnumSource(Target.class)
    void fakeContentUnderAnImageTypeOrExtensionIsRejected(Target target) throws Exception {
        Setup setup = setup();
        int before = storedImages();
        byte[] svg = "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>".getBytes();
        byte[] gif = "GIF89a\u0001\u0000\u0001\u0000\u0080\u0000\u0000".getBytes();

        HttpResponse<String> png = multipart(
                "PUT",
                path(target, setup),
                token(target, setup),
                parts(target, Part.file("slika.png", "image/png", svg)));
        HttpResponse<String> jpg = multipart(
                "PUT",
                path(target, setup),
                token(target, setup),
                parts(target, Part.file("slika.jpg", "image/jpeg", gif)));
        HttpResponse<String> html = multipart(
                "PUT",
                path(target, setup),
                token(target, setup),
                parts(target, Part.file("slika.jpg", "image/jpeg", "<html><script>1</script></html>".getBytes())));

        for (HttpResponse<String> response : List.of(png, jpg, html)) {
            assertThat(response.statusCode()).isEqualTo(400);
            assertThat(fieldErrors(response.body())).containsEntry("file", "INVALID_IMAGE");
        }
        assertThat(storedImages()).isEqualTo(before);
    }

    @ParameterizedTest
    @EnumSource(Target.class)
    void fileOverFiveMegabytesIsRejected(Target target) throws Exception {
        Setup setup = setup();
        int before = storedImages();
        byte[] tooBig = new byte[5 * 1024 * 1024 + 1];
        tooBig[0] = (byte) 0xFF;
        tooBig[1] = (byte) 0xD8;
        tooBig[2] = (byte) 0xFF;

        HttpResponse<String> response = multipart(
                "PUT",
                path(target, setup),
                token(target, setup),
                parts(target, Part.file("slika.jpg", "image/jpeg", tooBig)));

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("file", "FILE_TOO_LARGE");
        assertThat(storedImages()).isEqualTo(before);
    }

    @ParameterizedTest
    @EnumSource(Target.class)
    void eleventhUploadWithinAMinuteIsRateLimitedEvenWithAValidImage(Target target) throws Exception {
        Setup setup = setup();
        String token = token(target, setup);
        byte[] junk = "ni slika".getBytes();
        for (int i = 1; i <= 10; i++) {
            HttpResponse<String> response = multipart(
                    "PUT", path(target, setup), token, parts(target, Part.file("slika.jpg", "image/jpeg", junk)));
            assertThat(response.statusCode()).as("poskus " + i).isEqualTo(400);
        }
        int before = storedImages();

        HttpResponse<String> limited = multipart(
                "PUT",
                path(target, setup),
                token,
                parts(target, Part.file("slika.jpg", "image/jpeg", TestImages.jpeg(100, 100))));

        assertThat(limited.statusCode()).isEqualTo(429);
        assertThat(json(limited.body())).containsOnlyKeys("code").containsEntry("code", "RATE_LIMITED");
        assertThat(storedImages()).isEqualTo(before);
    }

    @Test
    void theLimitIsPerUserAndSharedByAllUploadEndpoints() throws Exception {
        Setup setup = setup();
        String admin = setup.s().token(Who.ADMIN);
        byte[] junk = "ni slika".getBytes();
        Part file = Part.file("slika.jpg", "image/jpeg", junk);
        for (int i = 0; i < 4; i++) {
            multipart("PUT", "/api/me/photo", admin, List.of(file));
        }
        for (int i = 0; i < 3; i++) {
            multipart("PUT", photoPath(setup.s().group()), admin, List.of(file, Part.field("version", "0")));
        }
        for (int i = 0; i < 3; i++) {
            multipart(
                    "PUT",
                    contactPhotoPath(setup.s().group(), setup.contact()),
                    admin,
                    List.of(file, Part.field("version", "0")));
        }

        HttpResponse<String> limited =
                multipart("PUT", "/api/me/photo", admin, List.of(Part.file(TestImages.jpeg(100, 100))));
        // drug uporabnik ni prizadet
        HttpResponse<String> other = multipart(
                "PUT", "/api/me/photo", setup.s().token(Who.OWNER), List.of(Part.file(TestImages.jpeg(100, 100))));

        assertThat(limited.statusCode()).isEqualTo(429);
        assertThat(other.statusCode()).isEqualTo(200);
    }

    @Test
    void readsAreNotCountedAgainstTheUploadLimit() throws Exception {
        Setup setup = setup();
        String editor = setup.s().token(Who.EDITOR);
        multipart("PUT", "/api/me/photo", editor, List.of(Part.file(TestImages.jpeg(100, 100))));

        for (int i = 0; i < 15; i++) {
            assertThat(download("/api/me/photo", editor).statusCode()).isEqualTo(200);
        }

        assertThat(multipart("PUT", "/api/me/photo", editor, List.of(Part.file(TestImages.jpeg(100, 100))))
                        .statusCode())
                .isEqualTo(200);
    }
}
