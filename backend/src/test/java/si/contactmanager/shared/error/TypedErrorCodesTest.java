package si.contactmanager.shared.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import si.contactmanager.contact.TypeConflict;

/** Kodi napak 016 (feature-map §2.10): {@code ATTRIBUTE_TYPE_CONFLICT} (409, s podrobnostmi) in {@code MAP_SERVICE_UNAVAILABLE} (503). */
@Tag("FR-016-05")
@Tag("FR-016-23")
class TypedErrorCodesTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void attributeTypeConflictIs409WithCodeAndDetails() {
        UUID contact = UUID.randomUUID();
        TypeConflict details = new TypeConflict(List.of(new TypeConflict.Item(contact, "Ana Novak", "abc")), 1);

        ResponseEntity<DetailedError> response =
                handler.attributeTypeConflict(new AttributeTypeConflictException(details));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("ATTRIBUTE_TYPE_CONFLICT");
        assertThat(response.getBody().details()).isSameAs(details);
    }

    @Test
    void mapServiceUnavailableIs503WithCodeOnly() {
        ResponseEntity<ErrorResponse> response = handler.mapServiceUnavailable();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isEqualTo(new ErrorResponse("MAP_SERVICE_UNAVAILABLE"));
    }
}
