package si.contactmanager.image;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.account.UserDirectory;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.UnauthenticatedException;

/**
 * Lastna profilna slika (018 plan.md – REST endpoints). Poti nimajo id-ja uporabnika: uporabnik je vedno iz žetona,
 * zato tuje slike ni mogoče nasloviti (FR-018-01, FR-018-02).
 */
@RestController
@RequestMapping("/api/me/photo")
class MePhotoController {

    private final UserDirectory users;
    private final ImageService images;

    MePhotoController(UserDirectory users, ImageService images) {
        this.users = users;
        this.images = images;
    }

    @GetMapping
    ResponseEntity<byte[]> get(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(name = "size", required = false) String size,
            @RequestHeader(name = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        long user = users.find(jwt).orElseThrow(NotFoundException::new);
        return images.serve(Owner.user(user), UploadGuard.size(size), ifNoneMatch);
    }

    @PutMapping
    PhotoResult put(@AuthenticationPrincipal Jwt jwt, HttpServletRequest request) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        images.throttle(user);
        byte[] bytes = UploadGuard.file(request, images.maxBytes());
        return new PhotoResult(images.put(Owner.user(user), bytes), null);
    }

    /** Idempotentno: brez slike (ali brez profila) je odgovor prav tako 204. */
    @DeleteMapping
    ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt) {
        users.find(jwt).ifPresent(user -> images.remove(Owner.user(user)));
        return ResponseEntity.noContent().build();
    }
}
