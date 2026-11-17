package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/** Glave odgovora slike (FR-018-22, research R-05). */
@Tag("FR-018-22")
class ImageResponsesTest {

    private static final byte[] DATA = {1, 2, 3};

    @Test
    void imageResponseIsPrivateNoCacheWithEtagAndHardeningHeaders() {
        ResponseEntity<byte[]> response = ImageResponses.image(new StoredImage(7, 256, "image/jpeg", DATA));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        HttpHeaders headers = response.getHeaders();
        assertThat(headers.getCacheControl()).contains("no-cache").contains("private");
        assertThat(headers.getETag()).isEqualTo("\"7-256\"");
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headers.getFirst("Content-Security-Policy")).isEqualTo("default-src 'none'");
        assertThat(headers.getFirst(HttpHeaders.CONTENT_DISPOSITION)).isEqualTo("inline");
        assertThat(headers.getContentType()).hasToString("image/jpeg");
        assertThat(response.getBody()).isEqualTo(DATA);
    }

    @Test
    void pngKeepsItsContentType() {
        ResponseEntity<byte[]> response = ImageResponses.image(new StoredImage(1, 96, "image/png", DATA));

        assertThat(response.getHeaders().getContentType()).hasToString("image/png");
    }

    @Test
    void notModifiedHasNoBodyButTheSameHeaders() {
        ResponseEntity<byte[]> response = ImageResponses.notModified("\"7-256\"");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_MODIFIED);
        assertThat(response.getBody()).isNull();
        assertThat(response.getHeaders().getETag()).isEqualTo("\"7-256\"");
        assertThat(response.getHeaders().getCacheControl()).contains("no-cache").contains("private");
        assertThat(response.getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
    }

    @Test
    void etagCombinesRevisionAndSize() {
        assertThat(ImageResponses.etag(3, 96)).isEqualTo("\"3-96\"");
        assertThat(ImageResponses.etag(3, 512)).isNotEqualTo(ImageResponses.etag(3, 96));
        assertThat(ImageResponses.etag(4, 96)).isNotEqualTo(ImageResponses.etag(3, 96));
    }

    @Test
    void ifNoneMatchMatchesListsWeakTagsAndWildcard() {
        String etag = "\"7-256\"";

        assertThat(ImageResponses.matches("\"7-256\"", etag)).isTrue();
        assertThat(ImageResponses.matches("\"1-256\", \"7-256\"", etag)).isTrue();
        assertThat(ImageResponses.matches("W/\"7-256\"", etag)).isTrue();
        assertThat(ImageResponses.matches("*", etag)).isTrue();
        assertThat(ImageResponses.matches("\"6-256\"", etag)).isFalse();
        assertThat(ImageResponses.matches("\"7-96\"", etag)).isFalse();
        assertThat(ImageResponses.matches(null, etag)).isFalse();
        assertThat(ImageResponses.matches(" ", etag)).isFalse();
    }
}
