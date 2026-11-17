package si.contactmanager.image;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
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
import si.contactmanager.contact.ContactPhotoSupport;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;

/**
 * Slika kontakta (FR-018-09, FR-018-10): branje VIEWER+ (tudi arhivirana skupina), spreminjanje EDITOR+. Vrstni red:
 * 401 → 404 (skupina, kontakt) → 403 → 409 {@code GROUP_ARCHIVED} → 409 {@code VERSION_CONFLICT} → 400 (datoteka).
 */
@RestController
@RequestMapping("/api/groups/{groupId}/contacts/{contactId}/photo")
class ContactPhotoController {

    private final GroupAccess access;
    private final ImageService images;
    private final ContactPhotoService photos;
    private final ContactPhotoSupport contacts;

    ContactPhotoController(
            GroupAccess access, ImageService images, ContactPhotoService photos, ContactPhotoSupport contacts) {
        this.access = access;
        this.images = images;
        this.photos = photos;
        this.contacts = contacts;
    }

    @GetMapping
    ResponseEntity<byte[]> get(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(name = "size", required = false) String size,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = parse(contactId);
        contacts.requireExists(membership, contact);
        return images.serve(Owner.contact(membership.groupId(), contact), UploadGuard.size(size), ifNoneMatch);
    }

    @PutMapping
    PhotoResult put(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            HttpServletRequest request) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = parse(contactId);
        contacts.requireWritable(membership, contact);
        images.throttle(membership.userId());
        long version = UploadGuard.version(request);
        contacts.checkVersion(membership, contact, version);
        ProcessedImage image = images.prepare(UploadGuard.file(request, images.maxBytes()));
        return photos.put(membership, contact, version, image);
    }

    @DeleteMapping
    PhotoResult delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(name = "version", required = false) String version) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID contact = parse(contactId);
        contacts.requireWritable(membership, contact);
        long sent = UploadGuard.version(version);
        contacts.checkVersion(membership, contact, sent);
        return photos.remove(membership, contact, sent);
    }

    private static UUID parse(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }
}
