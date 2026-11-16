package si.contactmanager.shared.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import si.contactmanager.shared.error.ValidationError.FieldError;

/**
 * Preslikava napak slik v odgovore (FR-018-14, 15, 20; feature-map §2.2, §2.10): kode datoteke so polje {@code file}
 * pod {@code VALIDATION_FAILED}, omejitev je {@code 429 RATE_LIMITED}, Google prevzem {@code 409 GOOGLE_PHOTO_UNAVAILABLE}.
 */
class ImageErrorMappingTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @ParameterizedTest
    @ValueSource(strings = {"INVALID_IMAGE", "IMAGE_TOO_LARGE", "FILE_TOO_LARGE", "REQUIRED"})
    @Tag("FR-018-14")
    void fileCodesAreFieldErrorsUnderValidationFailed(String code) {
        ResponseEntity<ValidationError> response =
                handler.validation(new ValidationException(List.of(new FieldError("file", code))));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isEqualTo(ValidationError.of(List.of(new FieldError("file", code))));
        assertThat(response.getBody().code()).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    @Tag("FR-018-15")
    void rateLimitIsTooManyRequestsWithRateLimitedCode() {
        ResponseEntity<ErrorResponse> response = handler.rateLimited();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(response.getBody()).isEqualTo(new ErrorResponse("RATE_LIMITED"));
    }

    @Test
    @Tag("FR-018-20")
    void unavailableGooglePhotoIsConflictWithoutTheReasonInTheBody() {
        ResponseEntity<ErrorResponse> response = handler.googlePhotoUnavailable();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isEqualTo(new ErrorResponse("GOOGLE_PHOTO_UNAVAILABLE"));
    }

    @Test
    @Tag("FR-018-14")
    void oversizedMultipartBodyIsFileTooLargeAndMalformedOneIsRequired() {
        assertThat(handler.uploadTooLarge().getBody())
                .isEqualTo(ValidationError.of(List.of(new FieldError("file", "FILE_TOO_LARGE"))));
        assertThat(handler.malformedMultipart().getBody())
                .isEqualTo(ValidationError.of(List.of(new FieldError("file", "REQUIRED"))));
    }
}
