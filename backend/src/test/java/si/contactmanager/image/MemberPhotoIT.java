package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.image.support.ImageApiTest;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;

/** Slika člana skupine {@code GET /api/groups/{groupId}/members/{memberId}/photo} (FR-018-03, FR-018-22). */
class MemberPhotoIT extends ImageApiTest {

    private UUID memberId(UUID group, long userId) {
        return jdbc.queryForObject(
                "select id from group_member where group_id = ? and user_id = ?", UUID.class, group, userId);
    }

    private String memberPhoto(UUID group, UUID member) {
        return "/api/groups/" + group + "/members/" + member + "/photo";
    }

    @Test
    @Tag("FR-018-03")
    void everyRoleSeesAMemberPhotoOfTheSameGroup() throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));
        UUID member = memberId(s.group(), s.id(Who.EDITOR));

        for (Who who : List.of(Who.OWNER, Who.ADMIN, Who.EDITOR, Who.VIEWER)) {
            HttpResponse<byte[]> response = download(memberPhoto(s.group(), member), s.token(who));
            assertThat(response.statusCode()).as(who.name()).isEqualTo(200);
            assertThat(response.headers().firstValue("Content-Type")).hasValue("image/jpeg");
            assertThat(response.headers().firstValue("ETag")).hasValue("\"1-256\"");
        }
    }

    @Test
    @Tag("FR-018-03")
    void memberListCarriesPhotoRevisionOnlyForMembersWithAPhoto() throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(320, 320));

        HttpResponse<String> response = get("/api/groups/" + s.group() + "/members", s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Long> revisions = new java.util.HashMap<>();
        for (Map<String, Object> item : asObjects(json(response.body()).get("items"))) {
            Object revision = item.get("photoRevision");
            revisions.put((String) item.get("role"), revision == null ? null : ((Number) revision).longValue());
        }
        assertThat(revisions)
                .containsEntry("EDITOR", 2L)
                .containsEntry("OWNER", null)
                .containsEntry("VIEWER", null);
    }

    @Test
    @Tag("FR-018-03")
    void memberWithoutPhotoIsNotFound() throws Exception {
        Scenario s = scenario();

        HttpResponse<byte[]> response =
                download(memberPhoto(s.group(), memberId(s.group(), s.id(Who.EDITOR))), s.token(Who.VIEWER));

        assertThat(response.statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-018-03")
    void memberIdOfAnotherGroupIsNotFoundEvenIfThatMemberHasAPhoto() throws Exception {
        Scenario s = scenario();
        Scenario other = scenario();
        uploadMe(other.token(Who.EDITOR), TestImages.jpeg(300, 300));
        UUID foreign = memberId(other.group(), other.id(Who.EDITOR));

        HttpResponse<byte[]> response = download(memberPhoto(s.group(), foreign), s.token(Who.OWNER));

        assertThat(response.statusCode()).isEqualTo(404);
    }

    @Test
    @Tag("FR-018-03")
    void photoIsServedInAnArchivedGroupAndRemovedMemberPhotoDisappears() throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));
        UUID member = memberId(s.group(), s.id(Who.EDITOR));
        groups.archive(s.group());

        assertThat(download(memberPhoto(s.group(), member), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(200);

        jdbc.update("delete from group_member where id = ?", member);
        assertThat(download(memberPhoto(s.group(), member), s.token(Who.VIEWER)).statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-018-03")
    void malformedMemberIdIsNotFound() throws Exception {
        Scenario s = scenario();

        assertThat(download("/api/groups/" + s.group() + "/members/xyz/photo", s.token(Who.OWNER))
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    @Tag("FR-018-22")
    void nonMemberAndAnonymousNeverGetThePhoto() throws Exception {
        Scenario s = scenario();
        uploadMe(s.token(Who.EDITOR), TestImages.jpeg(300, 300));
        SignedIn stranger = registeredUser("Tujec");
        String path = memberPhoto(s.group(), memberId(s.group(), s.id(Who.EDITOR)));

        assertThat(download(path, stranger.idToken()).statusCode()).isEqualTo(404);
        assertThat(download(path, null).statusCode()).isEqualTo(401);
    }
}
