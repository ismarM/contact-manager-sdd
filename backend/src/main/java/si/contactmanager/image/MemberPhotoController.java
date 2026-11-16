package si.contactmanager.image;

import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;

/**
 * Slika člana skupine (FR-018-03): VIEWER+ vidi sliko člana iste skupine; član druge skupine, neobstoječ član ali član
 * brez slike je {@code 404}. Dovoljeno tudi v arhivirani skupini.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/members/{memberId}/photo")
class MemberPhotoController {

    private final GroupAccess access;
    private final ImageService images;
    private final JdbcClient jdbc;

    MemberPhotoController(GroupAccess access, ImageService images, JdbcClient jdbc) {
        this.access = access;
        this.images = images;
        this.jdbc = jdbc;
    }

    @GetMapping
    ResponseEntity<byte[]> get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String memberId,
            @RequestParam(name = "size", required = false) String size,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID member = parse(memberId);
        long user = jdbc.sql("SELECT user_id FROM group_member WHERE group_id = :group AND id = :id")
                .param("group", membership.groupId())
                .param("id", member)
                .query(Long.class)
                .optional()
                .orElseThrow(NotFoundException::new);
        return images.serve(Owner.user(user), UploadGuard.size(size), ifNoneMatch);
    }

    private static UUID parse(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }
}
