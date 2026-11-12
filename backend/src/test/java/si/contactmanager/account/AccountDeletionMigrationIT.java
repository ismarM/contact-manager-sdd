package si.contactmanager.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import si.contactmanager.support.PostgresContainer;

/**
 * Migracija 012 (FR-012-12, FR-012-18): obstoječi podatki ostanejo, nadgrobnik obstaja, sprožilec zavrne ponovno
 * ustvarjanje računa šele ob potrditvi, indeksi za {@code ON DELETE SET NULL} obstajajo. Lastna prazna baza brez Spring
 * konteksta (kot {@code MemberMigrationIT}); ciljna različica se izpelje iz imena datoteke migracije 012.
 */
@Tag("FR-012-12")
@Tag("FR-012-18")
class AccountDeletionMigrationIT {

    static final PostgreSQLContainer DATABASE = PostgresContainer.newContainer();
    private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration");

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
        String name = "m" + UUID.randomUUID().toString().replace("-", "");
        try (Connection admin = DriverManager.getConnection(
                        DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
                Statement statement = admin.createStatement()) {
            statement.executeUpdate("create database " + name);
        }
        url = DATABASE.getJdbcUrl().replace("/" + DATABASE.getDatabaseName(), "/" + name);
    }

    /** Različica migracije z imenom {@code V<n>__moji_podatki.sql}. */
    private static int ownVersion() throws IOException {
        Pattern pattern = Pattern.compile("V(\\d+)__moji_podatki\\.sql");
        try (var files = Files.list(MIGRATIONS)) {
            return files.map(path -> pattern.matcher(path.getFileName().toString()))
                    .filter(Matcher::matches)
                    .map(matcher -> Integer.parseInt(matcher.group(1)))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError("ni migracije moji_podatki"));
        }
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

    @Test
    void migrationKeepsExistingDataAndAddsTombstoneTriggerAndIndexes() throws Exception {
        int own = ownVersion();
        flyway(String.valueOf(own - 1)).migrate();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate(
                    "insert into app_user (firebase_uid, name, email) values ('uid-stari', 'Stari', 'stari@primer.si')");
            statement.executeUpdate("insert into contact_group (title) values ('Skupina')");
        }

        flyway(String.valueOf(own)).migrate();

        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            assertThat(count(statement, "select count(*) from app_user where firebase_uid = 'uid-stari'"))
                    .isEqualTo(1);
            assertThat(count(statement, "select count(*) from contact_group")).isEqualTo(1);
            assertThat(count(statement, "select count(*) from deleted_identity"))
                    .isZero();
            List<String> indexes = new ArrayList<>();
            try (ResultSet rs = statement.executeQuery("select indexdef from pg_indexes where schemaname = 'public'")) {
                while (rs.next()) {
                    indexes.add(rs.getString(1));
                }
            }
            assertThat(indexes)
                    .anyMatch(def -> def.contains("ON public.audit_entry") && def.contains("(actor_id)"))
                    .anyMatch(def -> def.contains("ON public.contact ") && def.contains("(updated_by)"))
                    .anyMatch(def -> def.contains("ON public.contact_group") && def.contains("(updated_by)"))
                    .anyMatch(def -> def.contains("ON public.group_member") && def.contains("(updated_by)"));
        }
    }

    @Test
    void triggerRejectsReCreatingAnAccountWithATombstonedUidOnlyAtCommit() throws Exception {
        flyway(String.valueOf(ownVersion())).migrate();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into deleted_identity (firebase_uid) values ('uid-izbrisan')");

            assertThatThrownBy(
                            () -> statement.executeUpdate(
                                    "insert into app_user (firebase_uid, name, email) values ('uid-izbrisan', 'Nov', 'nov@primer.si')"))
                    .isInstanceOf(SQLException.class)
                    .satisfies(error ->
                            assertThat(((SQLException) error).getSQLState()).isEqualTo("CM401"));

            statement.executeUpdate(
                    "insert into app_user (firebase_uid, name, email) values ('uid-drug', 'Drug', 'drug@primer.si')");
            assertThat(count(statement, "select count(*) from app_user where firebase_uid = 'uid-drug'"))
                    .isEqualTo(1);
            assertThat(count(statement, "select count(*) from app_user where firebase_uid = 'uid-izbrisan'"))
                    .isZero();
        }
    }

    @Test
    void deferredTriggerChecksAtCommitSoALaterTombstoneInTheSameTransactionIsHonoured() throws Exception {
        flyway(String.valueOf(ownVersion())).migrate();
        try (Connection connection = connect()) {
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.executeUpdate(
                        "insert into app_user (firebase_uid, name, email) values ('uid-tekma', 'Tekma', 'tekma@primer.si')");
                statement.executeUpdate("insert into deleted_identity (firebase_uid) values ('uid-tekma')");
            }
            assertThatThrownBy(connection::commit)
                    .isInstanceOf(SQLException.class)
                    .satisfies(error ->
                            assertThat(((SQLException) error).getSQLState()).isEqualTo("CM401"));
        }
    }

    private static int count(Statement statement, String sql) throws SQLException {
        try (ResultSet rs = statement.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }
}
