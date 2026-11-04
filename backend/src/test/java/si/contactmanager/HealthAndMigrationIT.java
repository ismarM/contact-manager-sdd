package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import si.contactmanager.support.Http;
import si.contactmanager.support.PostgresContainer;

@Tag("FR-000-02")
@Tag("FR-000-03")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthAndMigrationIT {

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        PostgresContainer.register(registry);
    }

    @LocalServerPort
    int port;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void healthIsPublicAndReportsUpWithoutInternalDetails() throws Exception {
        HttpResponse<String> response = Http.get("http://localhost:" + port + "/api/health");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(Http.compact(response.body())).isEqualTo("{\"status\":\"UP\"}");
    }

    @Test
    void migrationV1IsAppliedOnStartup() {
        assertThat(historyTableExists()).as("flyway_schema_history exists").isTrue();

        List<Map<String, Object>> v1 =
                jdbc.queryForList("select success from flyway_schema_history where version = '1'");
        assertThat(v1).hasSize(1);
        assertThat(v1.getFirst().get("success")).isEqualTo(true);
    }

    @Test
    void restartDoesNotReapplyMigrations() {
        assertThat(historyTableExists()).as("flyway_schema_history exists").isTrue();
        Integer before = jdbc.queryForObject("select count(*) from flyway_schema_history", Integer.class);

        var container = PostgresContainer.shared();
        try (ConfigurableApplicationContext second = new SpringApplicationBuilder(ContactManagerApplication.class)
                .run(
                        "--server.port=0",
                        "--spring.datasource.url=" + container.getJdbcUrl(),
                        "--spring.datasource.username=" + container.getUsername(),
                        "--spring.datasource.password=" + container.getPassword())) {
            assertThat(second.isActive()).isTrue();
        }

        Integer after = jdbc.queryForObject("select count(*) from flyway_schema_history", Integer.class);
        assertThat(after).isEqualTo(before);
    }

    private boolean historyTableExists() {
        Integer count = jdbc.queryForObject(
                "select count(*) from information_schema.tables where table_name = 'flyway_schema_history'",
                Integer.class);
        return count != null && count == 1;
    }
}
