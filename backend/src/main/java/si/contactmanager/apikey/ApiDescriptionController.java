package si.contactmanager.apikey;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Strojno berljiv opis programskega vmesnika (019, FR-019-15, research R-08): ročno vzdrževan OpenAPI 3.1 iz
 * {@code api/openapi-v1.json}; javen, brez ključa. {@code ApiDescriptionIT} primerja njegove operacije z dejanskimi
 * preslikavami pod {@code /v1}.
 */
@RestController
class ApiDescriptionController {

    private final String description;

    ApiDescriptionController() {
        try (var in = new ClassPathResource("api/openapi-v1.json").getInputStream()) {
            this.description = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @GetMapping(value = "/v1/openapi.json", produces = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<String> openApi() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(description);
    }
}
