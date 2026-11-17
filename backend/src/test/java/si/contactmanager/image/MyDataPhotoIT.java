package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.net.http.HttpResponse;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Izvoz *Moji podatki* (012) vsebuje lastno profilno sliko, slik kontaktov in skupin pa ne (FR-018-18). */
@Tag("FR-018-18")
class MyDataPhotoIT extends ImageApiTest {

    private Map<String, Object> profileOf(SignedIn user) throws Exception {
        HttpResponse<String> response = get("/api/me/export", user.idToken());
        assertThat(response.statusCode()).isEqualTo(200);
        return asObject(json(response.body()).get("profile"));
    }

    @Test
    void exportContainsTheOwnProfilePhotoAsBase64OfVariant512() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        assertThat(uploadMe(ana.idToken(), TestImages.jpeg(800, 600)).statusCode())
                .isEqualTo(200);
        byte[] served = download("/api/me/photo?size=512", ana.idToken()).body();

        Map<String, Object> photo = asObject(profileOf(ana).get("photo"));

        assertThat(photo).containsOnlyKeys("contentType", "base64").containsEntry("contentType", "image/jpeg");
        assertThat(Base64.getDecoder().decode((String) photo.get("base64"))).isEqualTo(served);
    }

    @Test
    void exportKeepsAPngPhotoAsPng() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");
        BufferedImage transparent = new BufferedImage(200, 200, BufferedImage.TYPE_INT_ARGB);
        transparent.setRGB(10, 10, 0xFFFF0000);
        uploadMe(ana.idToken(), TestImages.png(transparent));

        assertThat(asObject(profileOf(ana).get("photo"))).containsEntry("contentType", "image/png");
    }

    @Test
    void userWithoutAPhotoHasNullPhotoAndTheOtherProfileFieldsAreUnchanged() throws Exception {
        SignedIn ana = registeredUser("Ana Novak");

        Map<String, Object> profile = profileOf(ana);

        assertThat(profile).containsEntry("photo", null).containsEntry("name", "Ana Novak");
        assertThat(profile.keySet()).contains("name", "email", "registeredAt", "language", "theme", "photo");
    }

    @Test
    void exportNeverContainsPhotosOfContactsGroupsOrOtherUsers() throws Exception {
        Scenario s = scenario();
        byte[] groupImage = TestImages.jpeg(310, 310);
        byte[] contactImage = TestImages.jpeg(330, 330);
        UUID contact = idOf(createViaApi(s, input("Janez", "Novak")));
        upload(photoPath(s.group()), s.token(Who.ADMIN), groupImage, 0L);
        upload(contactPhotoPath(s.group(), contact), s.token(Who.EDITOR), contactImage, 0L);
        uploadMe(s.token(Who.VIEWER), TestImages.jpeg(350, 350));
        String viewerPhoto = Base64.getEncoder()
                .encodeToString(
                        download("/api/me/photo?size=512", s.token(Who.VIEWER)).body());
        String groupPhoto = Base64.getEncoder()
                .encodeToString(download(photoPath(s.group()) + "?size=512", s.token(Who.ADMIN))
                        .body());
        String contactPhoto = Base64.getEncoder()
                .encodeToString(download(contactPhotoPath(s.group(), contact) + "?size=512", s.token(Who.ADMIN))
                        .body());

        for (Who who : new Who[] {Who.ADMIN, Who.EDITOR, Who.OWNER}) {
            String body = get("/api/me/export", s.token(who)).body();
            assertThat(body)
                    .as(who.name())
                    .doesNotContain(groupPhoto)
                    .doesNotContain(contactPhoto)
                    .doesNotContain(viewerPhoto);
            assertThat(asObject(asObject(json(body).get("profile")))).containsEntry("photo", null);
        }
        assertThat(asObject(profileOf(registeredUserWithPhoto()).get("photo"))).containsKey("base64");
    }

    private SignedIn registeredUserWithPhoto() throws Exception {
        SignedIn user = registeredUser("Z Sliko");
        uploadMe(user.idToken(), TestImages.jpeg(300, 300));
        return user;
    }
}
