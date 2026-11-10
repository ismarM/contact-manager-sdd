package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import si.contactmanager.support.PostgresContainer;

/**
 * Migracija V7 → V8 na bazi z obstoječimi kontakti (D-63, D-64; research R-02): vrednosti ostanejo, vrstni red postane
 * slovenski, indeksa obstajata, V4 ni spremenjen. Lastna prazna baza brez Spring konteksta (kot MemberMigrationIT).
 */
@Tag("FR-008-07")
class ContactSortMigrationIT {

    /** SHA-256 datoteke V4 na {@code main} ob pisanju testa: sprememba V4 test pade. */
    private static final String V4_SHA256 = "e2fb78da07e0d7b604cd50ba7307dac9dc1c7b84239d77ab8ba36dff3630a618";

    static final PostgreSQLContainer DATABASE = PostgresContainer.newContainer();

    @BeforeAll
    static void start() {
        DATABASE.start();
    }

    @AfterAll
    static void stop() {
        DATABASE.stop();
    }

    private String url;

    @BeforeEach
    void freshDatabase() throws SQLException {
        String name = "s" + UUID.randomUUID().toString().replace("-", "");
        try (Connection admin = DriverManager.getConnection(
                        DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                Statement statement = admin.createStatement()) {
            statement.executeUpdate("create database " + name);
        }
        url = DATABASE.getJdbcUrl().replace("/" + DATABASE.getDatabaseName(), "/" + name);
    }

    private Flyway flyway(String target) {
        return Flyway.configure()
                .dataSource(url, DATABASE.getUsername(), DATABASE.getPassword())
                .locations("classpath:db/migration")
                .target(target)
                .load();
    }

    private Connection connect() throws SQLException {
        return DriverManager.getConnection(url, DATABASE.getUsername(), DATABASE.getPassword());
    }

    private static final String GROUP = "0193c4a2-7a1f-7c3e-9b1a-000000000001";

    /** Kontakti pred V8: ključi z malimi črkami, kot jih piše 004; »C« kolacija jih ureja po kodnih točkah. */
    private void seed(Statement statement) throws SQLException {
        statement.executeUpdate(
                "insert into app_user (firebase_uid, name, email) values ('uid1', 'Uporabnik', 'u@primer.si')");
        statement.executeUpdate("insert into contact_group (id, title) values ('" + GROUP + "', 'Skupina')");
        String[][] contacts = {
            {"Ana", "Zupan"}, {"Bojan", "Čeh"}, {"Cene", "Cene"}, {"Dana", "Žagar"}, {"Eva", "Šuligoj"},
            {"Fani", "Dana"}, {"Gaja", null}, {"Hana", "Novak"}, {"Ivan", "Novak"}, {"Jure", "Novak"}
        };
        for (String[] contact : contacts) {
            String last = contact[1] == null ? "null" : "'" + contact[1] + "'";
            String lastKey = contact[1] == null ? "null" : "'" + contact[1].toLowerCase() + "'";
            statement.executeUpdate("insert into contact (group_id, first_name, last_name, sort_first, sort_last,"
                    + " updated_by) values ('" + GROUP + "', '" + contact[0] + "', " + last + ", '"
                    + contact[0].toLowerCase() + "', " + lastKey + ", 1)");
        }
    }

    private static List<String> order(Statement statement) throws SQLException {
        List<String> names = new ArrayList<>();
        try (ResultSet rs = statement.executeQuery("select first_name || coalesce(' ' || last_name, '') from contact"
                + " where group_id = '" + GROUP + "' order by sort_last nulls last, sort_first nulls last,"
                + " created_at, id")) {
            while (rs.next()) {
                names.add(rs.getString(1));
            }
        }
        return names;
    }

    @Test
    void valuesStayAndTheOrderBecomesSloveneAlphabetical() throws Exception {
        flyway("7").migrate();
        List<String> before;
        String keysBefore;
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            seed(statement);
            before = order(statement);
            try (ResultSet rs =
                    statement.executeQuery("select string_agg(coalesce(sort_last, '-') || '/' || sort_first,"
                            + " ',' order by first_name) from contact")) {
                rs.next();
                keysBefore = rs.getString(1);
            }
        }
        // pred V8 je vrstni red po kodnih točkah: Č, Š, Ž so za vsemi črkami z ASCII
        assertThat(before.indexOf("Bojan Čeh")).isGreaterThan(before.indexOf("Ana Zupan"));

        flyway("8").migrate();

        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            assertThat(order(statement))
                    .containsExactly(
                            "Cene Cene",
                            "Bojan Čeh",
                            "Fani Dana",
                            "Hana Novak",
                            "Ivan Novak",
                            "Jure Novak",
                            "Eva Šuligoj",
                            "Ana Zupan",
                            "Dana Žagar",
                            "Gaja");
            try (ResultSet rs =
                    statement.executeQuery("select string_agg(coalesce(sort_last, '-') || '/' || sort_first,"
                            + " ',' order by first_name) from contact")) {
                rs.next();
                assertThat(rs.getString(1)).as("vrednosti ključev ostanejo").isEqualTo(keysBefore);
            }
            try (ResultSet rs = statement.executeQuery("select count(*) from contact")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(10);
            }
        }
    }

    @Test
    void indexesExistAndTheDefaultQueryStillUsesTheSortIndex() throws Exception {
        flyway("7").migrate();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            seed(statement);
            statement.executeUpdate("insert into contact (group_id, first_name, last_name, sort_first, sort_last,"
                    + " updated_by) select '" + GROUP + "', 'Ime' || n, 'Priimek' || (n % 500), 'ime' || n,"
                    + " 'priimek' || (n % 500), 1 from generate_series(1, 10000) n");
        }

        flyway("8").migrate();

        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.execute("analyze contact");
            try (ResultSet rs = statement.executeQuery(
                    "select count(*) from pg_indexes where indexname in ('contact_group_sort', 'contact_attribute_key')")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(2);
            }
            StringBuilder plan = new StringBuilder();
            try (ResultSet rs = statement.executeQuery("explain select id from contact where group_id = '" + GROUP + "'"
                    + " order by sort_last nulls last, sort_first nulls last, created_at, id limit 25")) {
                while (rs.next()) {
                    plan.append(rs.getString(1)).append('\n');
                }
            }
            assertThat(plan.toString()).contains("contact_group_sort");
        }
    }

    @Test
    void migrationIsValidAndVersionFourIsUnchanged() throws Exception {
        flyway("8").migrate();

        flyway("8").validate();
        Path v4 = Path.of("src/main/resources/db/migration/V4__kontakti.sql");
        String hash =
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(v4)));
        assertThat(hash).as("V4__kontakti.sql se ne sme spremeniti (D-63)").isEqualTo(V4_SHA256);
        try (Connection connection = connect();
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery("select max(version::int) from flyway_schema_history")) {
            rs.next();
            assertThat(rs.getInt(1)).isGreaterThanOrEqualTo(8);
        }
    }
}
