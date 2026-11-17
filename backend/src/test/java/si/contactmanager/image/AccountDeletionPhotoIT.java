package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;

/**
 * Izbris računa (012) izbriše profilno sliko in njene različice; slike skupin in kontaktov, ki jih je uporabnik naložil,
 * ostanejo (pripadajo skupini); drugim članom slika izgine iz seznama članov (FR-018-17 spec, FR-018-18).
 */
@Tag("FR-018-18")
class AccountDeletionPhotoIT extends ImageApiTest {

    private HttpResponse<String> deleteAccount(String token, String email) throws Exception {
        return post("/api/me/deletion", token, "{\"email\":\"" + email + "\"}");
    }

    @Test
    void deletionRemovesTheProfilePhotoButKeepsGroupAndContactPhotosTheUserUploaded() throws Exception {
        Scenario s = scenario();
        UUID contact = idOf(createViaApi(s, input("Janez", "Novak")));
        long admin = s.id(Who.ADMIN);
        assertThat(uploadMe(s.token(Who.ADMIN), TestImages.jpeg(300, 300)).statusCode())
                .isEqualTo(200);
        assertThat(upload(photoPath(s.group()), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 0L)
                        .statusCode())
                .isEqualTo(200);
        assertThat(upload(contactPhotoPath(s.group(), contact), s.token(Who.ADMIN), TestImages.jpeg(300, 300), 0L)
                        .statusCode())
                .isEqualTo(200);
        UUID profileImage = jdbc.queryForObject("select id from image where user_id = ?", UUID.class, admin);
        String email = groups.email(s.users().get(Who.ADMIN).uid());

        HttpResponse<String> response = deleteAccount(s.token(Who.ADMIN), email);

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(imageCount("kind = 'USER' and user_id = ?", admin)).isZero();
        assertThat(jdbc.queryForObject(
                        "select count(*) from image_variant where image_id = ?", Integer.class, profileImage))
                .isZero();
        assertThat(imageCount("kind = 'GROUP' and group_id = ?", s.group())).isEqualTo(1);
        assertThat(imageCount("kind = 'CONTACT' and group_id = ?", s.group())).isEqualTo(1);
        assertThat(download(photoPath(s.group()), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(200);
        assertThat(download(contactPhotoPath(s.group(), contact), s.token(Who.VIEWER))
                        .statusCode())
                .isEqualTo(200);
        assertContactImageInvariant();
    }

    @Test
    void anotherUsersProfilePhotoSurvivesAnAccountDeletion() throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.ADMIN), TestImages.jpeg(300, 300));
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));

        assertThat(deleteAccount(
                                s.token(Who.ADMIN),
                                groups.email(s.users().get(Who.ADMIN).uid()))
                        .statusCode())
                .isEqualTo(204);

        assertThat(imageCount("kind = 'USER' and user_id = ?", s.id(Who.EDITOR)))
                .isEqualTo(1);
        assertThat(download("/api/me/photo", s.token(Who.EDITOR)).statusCode()).isEqualTo(200);
        assertContactImageInvariant();
    }
}
