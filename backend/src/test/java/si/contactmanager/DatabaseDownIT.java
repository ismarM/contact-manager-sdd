package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import si.contactmanager.support.Http;
import si.contactmanager.support.PostgresContainer;

/** Lasten vsebnik PostgreSQL, ki ga test ustavi – skupnega ne sme. */
@Tag("FR-000-02")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.datasource.hikari.connection-timeout=2000"})
class DatabaseDownIT {

    static final PostgreSQLContainer DATABASE = PostgresContainer.newContainer();

    static {
        DATABASE.start();
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        PostgresContainer.register(registry, DATABASE);
    }

    @LocalServerPort
    int port;

    @Test
    void healthReportsDownWithoutDetailsWhenDatabaseIsUnreachable() throws Exception {
        DATABASE.stop();

        HttpResponse<String> response = Http.get("http://localhost:" + port + "/api/health");

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(Http.compact(response.body())).isEqualTo("{\"status\":\"DOWN\"}");
    }
}
