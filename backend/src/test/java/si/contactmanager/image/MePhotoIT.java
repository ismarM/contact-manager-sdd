package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;

/** Lastna profilna slika (FR-018-01, FR-018-02, FR-018-14, FR-018-22): nalaganje, zamenjava, odstranitev, streženje. */
class MePhotoIT extends ImageApiTest {

    private static BufferedImage decode(byte[] data) throws Exception {
        return ImageIO.read(new ByteArrayInputStream(data));
    }

    private long userId(SignedIn user) {
        return groups.userId(user.uid());
    }

    @Test
    @Tag("FR-018-01")
    void uploadStoresThreeVariantsAndRevisionOneAndProfileShowsIt() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        HttpResponse<String> response = uploadMe(ana.idToken(), TestImages.jpeg(800, 600));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json(response.body())).containsOnlyKeys("photoRevision").containsEntry("photoRevision", 1);
        assertThat(imageCount("kind = 'USER' and user_id = ?", userId(ana))).isEqualTo(1);
        assertThat(jdbc.queryForList(
                        "select v.size from image_variant v join image i on i.id = v.image_id where i.user_id = ?"
                                + " order by v.size",
                        Integer.class,
                        userId(ana)))
                .containsExactly(96, 256, 512);
        Map<String, Object> profile = json(put("/api/me", ana.idToken(), null).body());
        assertThat(profile).containsEntry("photoRevision", 1);
    }

    @Test
    @Tag("FR-018-01")
    void profileWithoutPhotoHasNullRevisionAndPhotoIs404() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        assertThat(json(put("/api/me", ana.idToken(), null).body())).containsEntry("photoRevision", null);
        HttpResponse<byte[]> photo = download("/api/me/photo", ana.idToken());
        assertThat(photo.statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-018-01")
    @Tag("FR-018-22")
    void getServesTheRequestedVariantWithHardeningHeaders() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(800, 600));

        HttpResponse<byte[]> small = download("/api/me/photo?size=96", ana.idToken());
        HttpResponse<byte[]> middle = download("/api/me/photo", ana.idToken());
        HttpResponse<byte[]> large = download("/api/me/photo?size=512", ana.idToken());

        assertThat(small.statusCode()).isEqualTo(200);
        assertThat(decode(small.body()).getWidth()).isEqualTo(96);
        assertThat(decode(middle.body()).getWidth()).isEqualTo(256);
        assertThat(decode(large.body()).getWidth()).isEqualTo(512);
        assertThat(decode(large.body()).getHeight()).isEqualTo(512);
        var headers = middle.headers();
        assertThat(headers.firstValue("Content-Type")).hasValue("image/jpeg");
        assertThat(headers.firstValue("Cache-Control").orElse(""))
                .contains("private")
                .contains("no-cache");
        assertThat(headers.firstValue("ETag")).hasValue("\"1-256\"");
        assertThat(headers.firstValue("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(headers.firstValue("Content-Security-Policy")).hasValue("default-src 'none'");
        assertThat(headers.firstValue("Content-Disposition")).hasValue("inline");
    }

    @Test
    @Tag("FR-018-22")
    void ifNoneMatchAnswers304WithoutBody() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        HttpResponse<byte[]> cached = download("/api/me/photo", ana.idToken(), Map.of("If-None-Match", "\"1-256\""));
        HttpResponse<byte[]> otherSize =
                download("/api/me/photo?size=96", ana.idToken(), Map.of("If-None-Match", "\"1-256\""));

        assertThat(cached.statusCode()).isEqualTo(304);
        assertThat(cached.body()).isEmpty();
        assertThat(cached.headers().firstValue("ETag")).hasValue("\"1-256\"");
        assertThat(otherSize.statusCode()).isEqualTo(200);
    }

    @Test
    @Tag("FR-018-01")
    void replacementRaisesRevisionKeepsOneImageAndOldEtagNoLongerMatches() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));
        byte[] first = download("/api/me/photo", ana.idToken()).body();

        HttpResponse<String> second =
                uploadMe(ana.idToken(), TestImages.png(TestImages.quadrants(400, 400, BufferedImage.TYPE_INT_ARGB)));

        assertThat(json(second.body())).containsEntry("photoRevision", 2);
        assertThat(imageCount("kind = 'USER' and user_id = ?", userId(ana))).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "select count(*) from image_variant v join image i on i.id = v.image_id where i.user_id = ?",
                        Integer.class,
                        userId(ana)))
                .as("različice nove slike 400 × 400 (256 in 96), stara 512 je zamenjana")
                .isEqualTo(2);
        HttpResponse<byte[]> stale = download("/api/me/photo", ana.idToken(), Map.of("If-None-Match", "\"1-256\""));
        assertThat(stale.statusCode()).isEqualTo(200);
        assertThat(stale.headers().firstValue("ETag")).hasValue("\"2-256\"");
        assertThat(stale.body()).isNotEqualTo(first);
    }

    @Test
    @Tag("FR-018-14")
    void transparentPngKeepsItsFormat() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        BufferedImage transparent = new BufferedImage(200, 200, BufferedImage.TYPE_INT_ARGB);
        transparent.setRGB(10, 10, 0xFFFF0000);

        uploadMe(ana.idToken(), TestImages.png(transparent));

        HttpResponse<byte[]> photo = download("/api/me/photo", ana.idToken());
        assertThat(photo.headers().firstValue("Content-Type")).hasValue("image/png");
    }

    @Test
    @Tag("FR-018-02")
    void deleteRemovesThePhotoAndIsIdempotent() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        HttpResponse<String> removed = Http.send("DELETE", url("/api/me/photo"), Http.bearer(ana.idToken()));
        HttpResponse<String> again = Http.send("DELETE", url("/api/me/photo"), Http.bearer(ana.idToken()));

        assertThat(removed.statusCode()).isEqualTo(204);
        assertThat(again.statusCode()).isEqualTo(204);
        assertThat(download("/api/me/photo", ana.idToken()).statusCode()).isEqualTo(404);
        assertThat(imageCount("kind = 'USER' and user_id = ?", userId(ana))).isZero();
        assertThat(jdbc.queryForObject("select count(*) from image_variant", Integer.class))
                .isEqualTo(jdbc.queryForObject(
                        "select count(*) from image_variant v join image i on i.id = v.image_id", Integer.class));
        assertThat(json(put("/api/me", ana.idToken(), null).body())).containsEntry("photoRevision", null);
    }

    @Test
    @Tag("FR-018-01")
    void photoOfOneUserIsNotTouchedByAnother() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        SignedIn bojan = registeredUser("Bojan Kos");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        assertThat(download("/api/me/photo", bojan.idToken()).statusCode()).isEqualTo(404);
        uploadMe(bojan.idToken(), TestImages.jpeg(300, 300));
        Http.send("DELETE", url("/api/me/photo"), Http.bearer(bojan.idToken()));

        assertThat(download("/api/me/photo", ana.idToken()).statusCode()).isEqualTo(200);
        assertThat(revisionOf("kind = 'USER' and user_id = ?", userId(ana))).isEqualTo(1L);
    }

    @Test
    @Tag("FR-018-01")
    void invalidSizeIsAValidationError() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        for (String size : List.of("100", "0", "abc", "-96")) {
            HttpResponse<byte[]> response = download("/api/me/photo?size=" + size, ana.idToken());
            assertThat(response.statusCode()).as(size).isEqualTo(400);
        }
    }

    @Test
    @Tag("FR-018-14")
    void invalidUploadChangesNothing() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        uploadMe(ana.idToken(), TestImages.jpeg(300, 300));

        HttpResponse<String> response = uploadMe(ana.idToken(), "<svg xmlns='http://www.w3.org/2000/svg'/>".getBytes());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(fieldErrors(response.body())).containsEntry("file", "INVALID_IMAGE");
        assertThat(revisionOf("kind = 'USER' and user_id = ?", userId(ana))).isEqualTo(1L);
    }
}
