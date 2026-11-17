package si.contactmanager.image;

import java.util.Arrays;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Odgovor slike (research R-05, FR-018-22): zasebno predpomnjenje z vedno novim preverjanjem članstva ({@code
 * no-cache}), {@code ETag} iz revizije in velikosti ter glave, ki preprečijo izvajanje vsebine.
 */
final class ImageResponses {

    private ImageResponses() {}

    static String etag(long revision, int size) {
        return "\"" + revision + "-" + size + "\"";
    }

    /** Ali {@code If-None-Match} ustreza {@code etag} (seznam vrednosti, šibke oznake, {@code *}). */
    static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
            return false;
        }
        return Arrays.stream(ifNoneMatch.split(","))
                .map(String::trim)
                .map(value -> value.startsWith("W/") ? value.substring(2) : value)
                .anyMatch(value -> value.equals("*") || value.equals(etag));
    }

    static ResponseEntity<byte[]> image(StoredImage image) {
        return base(HttpStatus.OK, etag(image.revision(), image.size()))
                .contentType(MediaType.parseMediaType(image.contentType()))
                .body(image.data());
    }

    static ResponseEntity<byte[]> notModified(String etag) {
        return base(HttpStatus.NOT_MODIFIED, etag).build();
    }

    private static ResponseEntity.BodyBuilder base(HttpStatus status, String etag) {
        return ResponseEntity.status(status)
                .cacheControl(CacheControl.noCache().cachePrivate())
                .eTag(etag)
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline");
    }
}
