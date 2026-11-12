package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Flow;
import javax.net.ssl.SSLSession;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import si.contactmanager.account.IdentityProvider.Outcome;
import si.contactmanager.shared.security.FirebaseProperties;

/**
 * Odjemalec Firebase brez omrežja (H1/H2, research R-06): lažen {@link HttpClient} in lažen vir žetona dokažeta obliko
 * zahtevka v emulatorskem in produkcijskem načinu ter preslikavo napak. Emulator tega ne dokazuje (produkcijska
 * konfiguracija ostane ročna vrata, tasks T074).
 */
@Tag("FR-012-14")
@Tag("FR-012-17")
class FirebaseIdentityProviderTest {

    private static final String UID = "uid-pia-0123456789abcdef";
    private static final String ACCESS_TOKEN = "ya29.PRIVILEGED-ACCESS-TOKEN";
    private static final String USER_ID_TOKEN = "eyJ.USER-ID-TOKEN.sig";

    private static final IdentityDeletionProperties PROPERTIES = new IdentityDeletionProperties(
            false,
            Duration.ofSeconds(30),
            Duration.ofSeconds(30),
            Duration.ofSeconds(5),
            Duration.ofSeconds(2),
            Duration.ofHours(2));

    private HttpClient http;
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    private Logger root;

    @BeforeEach
    void setUp() {
        http = mock(HttpClient.class);
        root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logs.start();
        root.addAppender(logs);
    }

    @AfterEach
    void tearDown() {
        root.detachAppender(logs);
    }

    /** Odgovor s stanjem in telesom; ostalo ni pomembno. */
    private record StubResponse(int statusCode, String body) implements HttpResponse<String> {
        @Override
        public HttpRequest request() {
            return null;
        }

        @Override
        public Optional<HttpResponse<String>> previousResponse() {
            return Optional.empty();
        }

        @Override
        public HttpHeaders headers() {
            return HttpHeaders.of(java.util.Map.of(), (a, b) -> true);
        }

        @Override
        public Optional<SSLSession> sslSession() {
            return Optional.empty();
        }

        @Override
        public URI uri() {
            return URI.create("https://localhost/");
        }

        @Override
        public HttpClient.Version version() {
            return HttpClient.Version.HTTP_1_1;
        }
    }

    private void respond(int status, String body) throws IOException, InterruptedException {
        doReturn(new StubResponse(status, body)).when(http).send(any(HttpRequest.class), any());
    }

    private FirebaseIdentityProvider emulatorProvider() {
        return new FirebaseIdentityProvider(
                http, () -> "owner", PROPERTIES, new FirebaseProperties("demo-contact-manager", "auth:9099"));
    }

    private FirebaseIdentityProvider productionProvider() {
        return new FirebaseIdentityProvider(
                http, () -> ACCESS_TOKEN, PROPERTIES, new FirebaseProperties("cm-prod-project", ""));
    }

    private HttpRequest sentRequest() throws IOException, InterruptedException {
        ArgumentCaptor<HttpRequest> request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any());
        return request.getValue();
    }

    private static String body(HttpRequest request) {
        List<ByteBuffer> chunks = new ArrayList<>();
        request.bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<>() {
            @Override
            public void onSubscribe(Flow.Subscription subscription) {
                subscription.request(Long.MAX_VALUE);
            }

            @Override
            public void onNext(ByteBuffer item) {
                chunks.add(item);
            }

            @Override
            public void onError(Throwable throwable) {}

            @Override
            public void onComplete() {}
        });
        StringBuilder text = new StringBuilder();
        chunks.forEach(chunk -> text.append(StandardCharsets.UTF_8.decode(chunk)));
        return text.toString();
    }

    @Test
    void emulatorRequestUsesEmulatorHostAndOwnerToken() throws Exception {
        respond(200, "{\"kind\":\"identitytoolkit#DeleteAccountResponse\"}");

        Outcome outcome = emulatorProvider().delete(UID);

        HttpRequest request = sentRequest();
        assertThat(outcome).isEqualTo(Outcome.DELETED);
        assertThat(request.method()).isEqualTo("POST");
        assertThat(request.uri())
                .isEqualTo(
                        URI.create(
                                "http://auth:9099/identitytoolkit.googleapis.com/v1/projects/demo-contact-manager/accounts:delete"));
        assertThat(request.headers().firstValue("Authorization")).contains("Bearer owner");
        assertThat(request.headers().firstValue("Content-Type"))
                .hasValueSatisfying(v -> assertThat(v).contains("application/json"));
        assertThat(body(request).replaceAll("\\s", "")).isEqualTo("{\"localId\":\"" + UID + "\"}");
        assertThat(request.timeout()).contains(Duration.ofSeconds(5));
    }

    @Test
    void productionRequestUsesGoogleHostAndPrivilegedAccessToken() throws Exception {
        respond(200, "{}");

        Outcome outcome = productionProvider().delete(UID);

        HttpRequest request = sentRequest();
        assertThat(outcome).isEqualTo(Outcome.DELETED);
        assertThat(request.uri())
                .isEqualTo(URI.create(
                        "https://identitytoolkit.googleapis.com/v1/projects/cm-prod-project/accounts:delete"));
        assertThat(request.headers().firstValue("Authorization")).contains("Bearer " + ACCESS_TOKEN);
        assertThat(body(request).replaceAll("\\s", "")).isEqualTo("{\"localId\":\"" + UID + "\"}");
        assertThat(request.timeout()).contains(Duration.ofSeconds(5));
    }

    @Test
    void userIdTokenIsNeverUsedAsAdministrativeCredential() throws Exception {
        respond(200, "{}");

        productionProvider().delete(UID);

        HttpRequest request = sentRequest();
        assertThat(request.headers().map().toString()).doesNotContain(USER_ID_TOKEN);
        assertThat(body(request)).doesNotContain(USER_ID_TOKEN).doesNotContain("idToken");
        assertThat(request.uri().toString()).doesNotContain(USER_ID_TOKEN).doesNotContain("key=");
        assertThat(request.headers().firstValue("Authorization"))
                .hasValueSatisfying(value -> assertThat(value).isEqualTo("Bearer " + ACCESS_TOKEN));
    }

    @Test
    void tokenSourceIsAskedOncePerRequest() throws Exception {
        respond(200, "{}");
        int[] calls = {0};
        FirebaseIdentityProvider provider = new FirebaseIdentityProvider(
                http,
                () -> {
                    calls[0]++;
                    return ACCESS_TOKEN;
                },
                PROPERTIES,
                new FirebaseProperties("cm-prod-project", ""));

        provider.delete(UID);

        assertThat(calls[0]).isEqualTo(1);
    }

    @ParameterizedTest
    @CsvSource(
            delimiter = '|',
            value = {
                "200|{}|DELETED",
                "400|{\"error\":{\"code\":400,\"message\":\"USER_NOT_FOUND\"}}|NOT_FOUND",
                "400|{\"error\":{\"code\":400,\"message\":\"INVALID_LOCAL_ID\"}}|RETRY",
                "400|{\"error\":{\"message\":\"SOMETHING_ELSE\"}}|RETRY",
                "401|{\"error\":{\"status\":\"UNAUTHENTICATED\"}}|MISCONFIGURED",
                "403|{\"error\":{\"status\":\"PERMISSION_DENIED\"}}|MISCONFIGURED",
                "429|{\"error\":{\"status\":\"RESOURCE_EXHAUSTED\"}}|RETRY",
                "500|{}|RETRY",
                "502|<html>bad gateway</html>|RETRY",
                "503|{}|RETRY"
            })
    void statusAndBodyAreMappedToOutcome(int status, String body, Outcome expected) throws Exception {
        respond(status, body);

        assertThat(productionProvider().delete(UID)).isEqualTo(expected);
    }

    @Test
    void networkErrorAndTimeoutBothMeanRetry() throws Exception {
        when(http.send(any(HttpRequest.class), any())).thenThrow(new IOException("connection refused"));
        assertThat(productionProvider().delete(UID)).isEqualTo(Outcome.RETRY);

        when(http.send(any(HttpRequest.class), any())).thenThrow(new HttpTimeoutException("request timed out"));
        assertThat(productionProvider().delete(UID)).isEqualTo(Outcome.RETRY);
    }

    @Test
    void tokenSourceFailureIsMisconfiguredAndNoRequestIsSent() throws Exception {
        FirebaseIdentityProvider provider = new FirebaseIdentityProvider(
                http,
                () -> {
                    throw new IOException("no application default credentials");
                },
                PROPERTIES,
                new FirebaseProperties("cm-prod-project", ""));

        assertThat(provider.delete(UID)).isEqualTo(Outcome.MISCONFIGURED);
        verifyNoInteractions(http);
    }

    @Test
    void outcomesNeverLogUidTokenOrResponseBody() throws Exception {
        String secretBody = "{\"error\":{\"message\":\"echo " + UID + " " + ACCESS_TOKEN + "\"}}";
        for (int status : new int[] {200, 400, 401, 403, 429, 503}) {
            respond(status, secretBody);
            productionProvider().delete(UID);
        }
        when(http.send(any(HttpRequest.class), any())).thenThrow(new IOException("failed " + UID + " " + ACCESS_TOKEN));
        productionProvider().delete(UID);

        assertThat(logs.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .noneMatch(
                        message -> message.contains(UID) || message.contains(ACCESS_TOKEN) || message.contains("echo"));
        verify(http, never()).sendAsync(any(), any());
    }
}
