package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import si.contactmanager.ContactManagerApplication;
import si.contactmanager.support.FirebaseEmulatorContainer;
import si.contactmanager.support.FirebaseEmulatorContainer.SignedIn;
import si.contactmanager.support.Http;
import si.contactmanager.support.PostgresContainer;

/**
 * Ponovni zagon aplikacije med nedokončanim izbrisom (FR-012-18, SC-008, SC-009; R-07, R-13): prvi kontekst aplikacije
 * naredi izbris ob izpadu Firebase in se zaustavi; drugi, neodvisen kontekst nad isto bazo z vklopljenim planerjem
 * dokonča brisanje brez novega zahtevka in počisti zastarele nadgrobnike.
 */
@Tag("FR-012-18")
class IdentityDeletionRestartIT {

    private final FirebaseEmulatorContainer emulator = FirebaseEmulatorContainer.shared();
    private final JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource(
            PostgresContainer.shared().getJdbcUrl(),
            PostgresContainer.shared().getUsername(),
            PostgresContainer.shared().getPassword()));

    private ConfigurableApplicationContext first;
    private ConfigurableApplicationContext second;

    @AfterEach
    void cleanUp() {
        emulator.unpause();
        for (ConfigurableApplicationContext context : new ConfigurableApplicationContext[] {first, second}) {
            if (context != null) {
                context.close();
            }
        }
    }

    private ConfigurableApplicationContext start(boolean scheduler) {
        // Argumenti ukazne vrstice imajo prednost pred application.yaml (privzete lastnosti bi jih izgubile).
        String[] arguments = Stream.of(
                        "server.port=0",
                        "spring.main.banner-mode=off",
                        "logging.level.root=WARN",
                        "spring.datasource.url=" + PostgresContainer.shared().getJdbcUrl(),
                        "spring.datasource.username="
                                + PostgresContainer.shared().getUsername(),
                        "spring.datasource.password="
                                + PostgresContainer.shared().getPassword(),
                        "firebase.project-id=" + FirebaseEmulatorContainer.PROJECT_ID,
                        "firebase.auth-emulator-host=" + emulator.getHost() + ":"
                                + emulator.getMappedPort(FirebaseEmulatorContainer.PORT),
                        "identity-deletion.scheduler-enabled=" + scheduler,
                        "identity-deletion.interval=1s",
                        "identity-deletion.lease=5s",
                        "identity-deletion.request-timeout=2s",
                        "identity-deletion.connect-timeout=1s",
                        "identity-deletion.tombstone-retention=2h")
                .map(argument -> "--" + argument)
                .toArray(String[]::new);
        return new SpringApplicationBuilder(ContactManagerApplication.class).run(arguments);
    }

    private static String base(ConfigurableApplicationContext context) {
        return "http://localhost:" + context.getEnvironment().getProperty("local.server.port");
    }

    private SignedIn register(ConfigurableApplicationContext context, String name) throws Exception {
        SignedIn user = emulator.signInWithGoogle("u-" + UUID.randomUUID() + "@primer.si", name);
        assertThat(Http.send("PUT", base(context) + "/api/me", Http.bearer(user.idToken()))
                        .statusCode())
                .isEqualTo(201);
        return user;
    }

    private HttpResponse<String> delete(ConfigurableApplicationContext context, SignedIn user) throws Exception {
        String email =
                jdbc.queryForObject("select email from app_user where firebase_uid = ?", String.class, user.uid());
        return Http.send(
                "POST",
                base(context) + "/api/me/deletion",
                Http.bearer(user.idToken()),
                "{\"email\":\"" + email + "\"}");
    }

    private static void await(String what, BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + 45_000_000_000L;
        while (System.nanoTime() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(250);
        }
        throw new AssertionError("ni se zgodilo v 45 s: " + what);
    }

    private Map<String, Object> tombstone(String uid) {
        return jdbc.queryForList("select * from deleted_identity where firebase_uid = ?", uid).stream()
                .findFirst()
                .orElse(null);
    }

    @Test
    void anUnfinishedDeletionIsCompletedAfterARestartWithoutANewRequestAndStaleTombstonesAreCleaned() throws Exception {
        first = start(false);
        SignedIn x = register(first, "Iks Ponovni Zagon");
        int[] status = new int[1];
        emulator.paused(() -> status[0] = delete(first, x).statusCode());
        assertThat(status[0]).isEqualTo(202);
        assertThat(tombstone(x.uid())).isNotNull();
        assertThat(tombstone(x.uid()).get("provider_deleted_at")).isNull();
        assertThat(emulator.identityExists(x.uid())).isTrue();
        first.close();
        first = null;

        String stale = "uid-zastarel-" + UUID.randomUUID();
        String young = "uid-mlad-" + UUID.randomUUID();
        jdbc.update(
                "insert into deleted_identity (firebase_uid, provider_deleted_at, next_attempt_at) values (?, ?, now())",
                stale,
                OffsetDateTime.now().minusHours(3));
        jdbc.update(
                "insert into deleted_identity (firebase_uid, provider_deleted_at, next_attempt_at) values (?, ?, now())",
                young,
                OffsetDateTime.now().minusHours(1));
        jdbc.update("update deleted_identity set next_attempt_at = now() where firebase_uid = ?", x.uid());

        second = start(true);

        await("brisanje identitete po zagonu", () -> tombstone(x.uid()).get("provider_deleted_at") != null);
        await("čiščenje zastarelega nadgrobnika", () -> tombstone(stale) == null);
        assertThat(emulator.identityExists(x.uid())).isFalse();
        assertThat(tombstone(young)).as("mlajši od 2 h ostane").isNotNull();

        SignedIn y = register(second, "Ipsilon Po Zagonu");
        assertThat(delete(second, y).statusCode()).as("nov izbris po zagonu").isEqualTo(204);
    }
}
