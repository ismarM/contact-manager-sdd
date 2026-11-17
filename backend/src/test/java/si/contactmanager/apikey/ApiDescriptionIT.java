package si.contactmanager.apikey;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import si.contactmanager.support.ApiTest;
import si.contactmanager.support.Http;
import tools.jackson.databind.JsonNode;

/**
 * Opis vmesnika {@code GET /v1/openapi.json} (019, FR-019-15, -19): javen, JSON, različica 1 in množica operacij
 * (metoda, pot) je enaka dejanskim preslikavam pod {@code /v1} – v obe smeri.
 */
@Tag("FR-019-15")
@Tag("FR-019-19")
class ApiDescriptionIT extends ApiTest {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping mappings;

    private JsonNode description() throws Exception {
        HttpResponse<String> response = Http.get(url("/v1/openapi.json"));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/json");
        return JSON.readTree(response.body());
    }

    @Test
    void descriptionIsOpenApi31WithVersionOne() throws Exception {
        JsonNode document = description();

        assertThat(document.get("openapi").asString()).startsWith("3.1");
        assertThat(document.get("info").get("version").asString()).isEqualTo("1");
        assertThat(document.get("components").get("securitySchemes").get("apiKey"))
                .isNotNull();
    }

    @Test
    void operationsInTheDescriptionAreExactlyTheMappingsUnderV1() throws Exception {
        Set<String> described = new TreeSet<>();
        JsonNode paths = description().get("paths");
        paths.propertyNames()
                .forEach(path -> paths.get(path)
                        .propertyNames()
                        .forEach(method -> described.add(method.toUpperCase() + " " + path)));

        Set<String> actual = new TreeSet<>();
        for (RequestMappingInfo info : mappings.getHandlerMethods().keySet()) {
            Set<String> patterns = info.getPathPatternsCondition() == null
                    ? Set.of()
                    : info.getPathPatternsCondition().getPatternValues();
            for (String pattern : patterns) {
                if (pattern.startsWith("/v1/")) {
                    info.getMethodsCondition()
                            .getMethods()
                            .forEach(method -> actual.add(method.name() + " " + pattern));
                }
            }
        }

        assertThat(actual).isNotEmpty();
        assertThat(described).containsExactlyInAnyOrderElementsOf(actual);
    }

    @Test
    void everyOperationDocumentsUnauthenticatedExceptTheDescriptionItself() throws Exception {
        JsonNode paths = description().get("paths");
        paths.propertyNames()
                .forEach(path -> paths.get(path).propertyNames().forEach(method -> {
                    JsonNode responses = paths.get(path).get(method).get("responses");
                    if (!path.equals("/v1/openapi.json")) {
                        assertThat(responses.has("401"))
                                .as(method + " " + path + " 401")
                                .isTrue();
                        assertThat(responses.has("429"))
                                .as(method + " " + path + " 429")
                                .isTrue();
                    }
                }));
    }
}
