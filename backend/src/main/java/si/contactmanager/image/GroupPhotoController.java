package si.contactmanager.image;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.GroupPhotoVersion;
import si.contactmanager.group.Role;

/**
 * Slika skupine (FR-018-05 do 08): branje VIEWER+ (tudi arhivirana skupina), spreminjanje ADMIN+ v nearhivirani
 * skupini. Vrstni red: 401 → 404 → 403 → 409 {@code GROUP_ARCHIVED} → 409 {@code VERSION_CONFLICT} → 400 (datoteka).
 */
@RestController
@RequestMapping("/api/groups/{groupId}/photo")
class GroupPhotoController {

    private final GroupAccess access;
    private final ImageService images;
    private final GroupPhotoService photos;
    private final GroupPhotoVersion versions;

    GroupPhotoController(
            GroupAccess access, ImageService images, GroupPhotoService photos, GroupPhotoVersion versions) {
        this.access = access;
        this.images = images;
        this.photos = photos;
        this.versions = versions;
    }

    @GetMapping
    ResponseEntity<byte[]> get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(name = "size", required = false) String size,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        return images.serve(Owner.group(membership.groupId()), UploadGuard.size(size), ifNoneMatch);
    }

    @PutMapping
    PhotoResult put(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, HttpServletRequest request) {
        Membership membership = access.require(jwt, groupId, Role.ADMIN, true);
        images.throttle(membership.userId());
        long version = UploadGuard.version(request);
        versions.check(membership, version);
        ProcessedImage image = images.prepare(UploadGuard.file(request, images.maxBytes()));
        return photos.put(membership, version, image);
    }

    @DeleteMapping
    PhotoResult delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(name = "version", required = false) String version) {
        Membership membership = access.require(jwt, groupId, Role.ADMIN, true);
        long sent = UploadGuard.version(version);
        versions.check(membership, sent);
        return photos.remove(membership, sent);
    }
}
