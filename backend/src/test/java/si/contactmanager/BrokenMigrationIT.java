package si.contactmanager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import si.contactmanager.support.PostgresContainer;

/** Migracija z napako prepreči zagon; shema ostane v zadnjem veljavnem stanju (FR-000-03). */
@Tag("FR-000-03")
class BrokenMigrationIT {

    static final PostgreSQLContainer DATABASE = PostgresContainer.newContainer();

    @BeforeAll
    static void start() {
        DATABASE.start();
    }

    @AfterAll
    static void stop() {
        DATABASE.stop();
    }

    @Test
    void failingMigrationPreventsStartupAndLeavesNoPartialChanges() throws Exception {
        assertThatThrownBy(() -> new SpringApplicationBuilder(ContactManagerApplication.class)
                        .run(
                                "--server.port=0",
                                "--spring.flyway.locations=classpath:db/broken",
                                "--spring.datasource.url=" + DATABASE.getJdbcUrl(),
                                "--spring.datasource.username=" + DATABASE.getUsername(),
                                "--spring.datasource.password=" + DATABASE.getPassword())
                        .close())
                .isInstanceOf(Exception.class)
                .hasStackTraceContaining("table_that_does_not_exist");

        try (Connection connection = DriverManager.getConnection(
                        DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                ResultSet tables = connection
                        .createStatement()
                        .executeQuery(
                                "select count(*) from information_schema.tables where table_name = 'broken_marker'")) {
            tables.next();
            assertThat(tables.getInt(1)).isZero();
        }
    }
}
