package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
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
 * Migracija 016 (FR-016-01, FR-016-04, FR-016-09): obstoječi ključi dobijo tip {@code OTHER} in verzijo 0, naslovi in
 * vrednosti ostanejo nespremenjeni, omejitve {@code CHECK} držijo, izbris skupine kaskadno odstrani ključe. Lastna
 * prazna baza brez Spring konteksta; migracija V13 se uporabi nad podatki iz V12.
 */
@Tag("FR-016-01")
@Tag("FR-016-04")
@Tag("FR-016-09")
class TypedAttributesMigrationIT {

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
        String name = "m" + UUID.randomUUID().toString().replace("-", "");
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

    private static int count(Statement statement, String sql) throws SQLException {
        try (ResultSet rs = statement.executeQuery(sql)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    @Test
    void existingKeysBecomeOtherAndExistingValuesStayUntouched() throws Exception {
        flyway("12").migrate();
        UUID group = UUID.randomUUID();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into contact_group (id, title) values ('" + group + "', 'Skupina')");
            statement.executeUpdate("insert into contact (id, group_id, first_name, address, phone, version) values ('"
                    + first + "', '" + group + "', 'Ana', 'Cesta 1, 1000 Ljubljana', '041 123 456', 4)");
            statement.executeUpdate(
                    "insert into contact (id, group_id, first_name) values ('" + second + "', '" + group + "', 'Bor')");
            statement.executeUpdate("insert into contact_attribute (contact_id, position, key, key_norm, value)"
                    + " values ('" + first + "', 0, 'Mobilni', 'mobilni', '040 111 222'),"
                    + " ('" + second + "', 0, 'mobilni', 'mobilni', '+386 40 333 444'),"
                    + " ('" + second + "', 1, 'Opomba', 'opomba', 'Pozdravi')");
        }

        flyway("13").migrate();

        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            assertThat(count(statement, "select count(*) from attribute_key")).isEqualTo(2);
            assertThat(count(
                            statement,
                            "select count(*) from attribute_key where type = 'OTHER' and version = 0"
                                    + " and group_id = '" + group + "'"))
                    .isEqualTo(2);
            assertThat(count(
                            statement,
                            "select count(*) from contact where id = '" + first + "' and version = 4"
                                    + " and address = 'Cesta 1, 1000 Ljubljana' and address_parts is null"
                                    + " and phone = '041 123 456'"))
                    .isEqualTo(1);
            assertThat(count(
                            statement,
                            "select count(*) from contact_attribute where parts is null and value is not null"))
                    .isEqualTo(3);
            assertThat(count(statement, "select count(*) from app_user where phone_format is not null"))
                    .isZero();
        }
    }

    @Test
    void checkConstraintsHold() throws Exception {
        flyway("13").migrate();
        UUID group = UUID.randomUUID();
        UUID contact = UUID.randomUUID();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into contact_group (id, title) values ('" + group + "', 'Skupina')");
            statement.executeUpdate("insert into contact (id, group_id, first_name) values ('" + contact + "', '"
                    + group + "', 'Ana')");
            statement.executeUpdate("insert into contact_attribute (contact_id, position, key, key_norm, parts)"
                    + " values ('" + contact + "', 0, 'Dom', 'dom', '{\"street\":\"Cesta 1\"}')");

            assertThatThrownBy(() ->
                            statement.executeUpdate("insert into attribute_key (group_id, key_norm, type) values ('"
                                    + group + "', 'x', 'FAX')"))
                    .hasMessageContaining("attribute_key_type_check");
            assertThatThrownBy(() -> statement.executeUpdate("update contact set address = 'Cesta 2',"
                            + " address_parts = '{\"street\":\"Cesta 2\"}' where id = '" + contact + "'"))
                    .hasMessageContaining("contact_address_one");
            assertThatThrownBy(() -> statement.executeUpdate(
                            "update contact set address_parts = '[]' where id = '" + contact + "'"))
                    .hasMessageContaining("address_parts");
            assertThatThrownBy(() -> statement.executeUpdate(
                            "insert into contact_attribute (contact_id, position, key, key_norm, value, parts)"
                                    + " values ('" + contact + "', 1, 'A', 'a', 'v', '{}')"))
                    .hasMessageContaining("contact_attribute_value_or_parts");
            assertThatThrownBy(() -> statement.executeUpdate(
                            "insert into contact_attribute (contact_id, position, key, key_norm)" + " values ('"
                                    + contact + "', 2, 'B', 'b')"))
                    .hasMessageContaining("contact_attribute_value_or_parts");
            assertThatThrownBy(() -> statement.executeUpdate("insert into app_user (firebase_uid, name, email,"
                            + " phone_format) values ('u1', 'U', 'u@primer.si', 'XX')"))
                    .hasMessageContaining("phone_format");
        }
    }

    @Test
    void attributeTypeEntryNeedsKeyAndBothTypesAndOtherKindsNone() throws Exception {
        flyway("13").migrate();
        UUID group = UUID.randomUUID();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into contact_group (id, title) values ('" + group + "', 'Skupina')");
            statement.executeUpdate("insert into audit_entry (group_id, seq, action, contact_count, attribute_key,"
                    + " type_before, type_after) values ('" + group + "', 1, 'ATTRIBUTE_TYPE', 2, 'mobilni',"
                    + " 'OTHER', 'PHONE')");
            assertThatThrownBy(() -> statement.executeUpdate(
                            "insert into audit_entry (group_id, seq, action, contact_count, attribute_key)"
                                    + " values ('" + group + "', 2, 'ATTRIBUTE_TYPE', 1, 'mobilni')"))
                    .hasMessageContaining("audit_entry_attribute_type");
            assertThatThrownBy(() -> statement.executeUpdate("insert into audit_entry (group_id, seq, action,"
                            + " contact_count, attribute_key, type_before, type_after) values ('" + group
                            + "', 3, 'UPDATE', 1, 'k', 'OTHER', 'PHONE')"))
                    .hasMessageContaining("audit_entry_attribute_type");
            statement.executeUpdate("insert into audit_entry (group_id, seq, action, contact_count)" + " values ('"
                    + group + "', 4, 'IMPORT', 1)");
            assertThatThrownBy(() -> statement.executeUpdate("insert into audit_entry (group_id, seq, action,"
                            + " contact_count) values ('" + group + "', 5, 'EXPORT', 1)"))
                    .hasMessageContaining("audit_entry_action_check");
        }
    }

    @Test
    void deletingAGroupCascadesItsAttributeKeys() throws Exception {
        flyway("13").migrate();
        UUID group = UUID.randomUUID();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into contact_group (id, title) values ('" + group + "', 'Skupina')");
            statement.executeUpdate("insert into attribute_key (group_id, key_norm, type) values ('" + group
                    + "', 'mobilni', 'PHONE')");
            assertThat(count(statement, "select count(*) from attribute_key")).isEqualTo(1);

            statement.executeUpdate("delete from contact_group where id = '" + group + "'");

            assertThat(count(statement, "select count(*) from attribute_key")).isZero();
        }
    }
}
