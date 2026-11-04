package si.contactmanager.shared.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@Tag("FR-000-20")
class RequestIdFilterTest {

    private final RequestIdFilter filter = new RequestIdFilter();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void generatesUuidWhenHeaderIsMissingAndExposesItInMdcAndResponse() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/anything");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> mdcDuringRequest = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> mdcDuringRequest.set(MDC.get("requestId")));

        String id = response.getHeader("X-Request-Id");
        assertThat(id).isNotBlank();
        assertThat(UUID.fromString(id)).isNotNull();
        assertThat(mdcDuringRequest.get()).isEqualTo(id);
    }

    @Test
    void keepsValidIncomingRequestId() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/anything");
        request.addHeader("X-Request-Id", "nginx-0123456789abcdef");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> mdcDuringRequest = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> mdcDuringRequest.set(MDC.get("requestId")));

        assertThat(response.getHeader("X-Request-Id")).isEqualTo("nginx-0123456789abcdef");
        assertThat(mdcDuringRequest.get()).isEqualTo("nginx-0123456789abcdef");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "abc def",
                "<script>",
                "id\nforged-log-line",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            })
    void replacesInvalidIncomingRequestIdWithNewUuid(String invalid) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/anything");
        request.addHeader("X-Request-Id", invalid);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        String id = response.getHeader("X-Request-Id");
        assertThat(id).isNotNull().isNotEqualTo(invalid);
        assertThat(UUID.fromString(id)).isNotNull();
    }

    @Test
    void clearsMdcAfterRequest() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/anything");
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicReference<String> mdcDuringRequest = new AtomicReference<>();

        filter.doFilter(request, response, (req, res) -> mdcDuringRequest.set(MDC.get("requestId")));

        assertThat(mdcDuringRequest.get()).isNotNull();
        assertThat(MDC.get("requestId")).isNull();
    }
}
