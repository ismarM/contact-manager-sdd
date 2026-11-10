package si.contactmanager.member;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
 * Migracija V6 → V7 na bazi z obstoječimi podatki (data-model.md, M1): lastna prazna baza, shema do V6, vrstice članstev
 * brez stolpca {@code id}, nato V7. Za Flyway {@code target} v repozitoriju ni predloge, zato ga test vzpostavi sam.
 */
@Tag("FR-007-03")
@Tag("FR-007-04")
@Tag("FR-007-05")
class MemberMigrationIT {

    static final PostgreSQLContainer DATABASE = PostgresContainer.newContainer();

    @BeforeAll
    static void start() {
        DATABASE.start();
    }

    @AfterAll
    static void stop() {
        DATABASE.stop();
    }

    /** Vsak test dobi lastno prazno bazo (vrstni red testov ni določen, migracije so enosmerne). */
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

    private static List<String> columns(Statement statement) throws SQLException {
        List<String> names = new ArrayList<>();
        try (ResultSet rs = statement.executeQuery(
                "select column_name from information_schema.columns where table_name = 'group_member'")) {
            while (rs.next()) {
                names.add(rs.getString(1));
            }
        }
        return names;
    }

    @Test
    void existingMembershipsGetDistinctIdsAndKeepEverythingElse() throws Exception {
        flyway("6").migrate();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            assertThat(columns(statement)).doesNotContain("id", "updated_at", "updated_by");
            for (int user = 1; user <= 5; user++) {
                statement.executeUpdate("insert into app_user (firebase_uid, name, email) values ('uid" + user
                        + "', 'Uporabnik " + user + "', 'u" + user + "@primer.si')");
            }
            statement.executeUpdate("insert into contact_group (id, title) values"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000001', 'Prva'),"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000002', 'Druga')");
            statement.executeUpdate("insert into group_member (group_id, user_id, role, version) values"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000001', 1, 'OWNER', 0),"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000001', 2, 'ADMIN', 3),"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000001', 3, 'VIEWER', 0),"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000002', 4, 'OWNER', 1),"
                    + " ('0193c4a2-7a1f-7c3e-9b1a-000000000002', 5, 'EDITOR', 2)");
        }

        String createdBefore;
        try (Connection connection = connect();
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(
                        "select string_agg(created_at::text, ',' order by user_id) from group_member")) {
            rs.next();
            createdBefore = rs.getString(1);
        }

        flyway("7").migrate();

        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            assertThat(columns(statement)).contains("id", "updated_at", "updated_by");
            try (ResultSet rs = statement.executeQuery(
                    "select string_agg(created_at::text, ',' order by user_id) from group_member")) {
                rs.next();
                assertThat(rs.getString(1)).as("created_at ostane nespremenjen").isEqualTo(createdBefore);
            }
            try (ResultSet rs = statement.executeQuery(
                    "select count(*) from pg_constraint where conname = 'group_member_id_key' and contype = 'u'")) {
                rs.next();
                assertThat(rs.getInt(1)).as("UNIQUE (id)").isEqualTo(1);
            }
            Set<String> ids = new HashSet<>();
            int rows = 0;
            try (ResultSet rs = statement.executeQuery(
                    "select id, user_id, role, version, updated_at, updated_by from group_member order by user_id")) {
                int[] versions = {0, 3, 0, 1, 2};
                String[] roles = {"OWNER", "ADMIN", "VIEWER", "OWNER", "EDITOR"};
                while (rs.next()) {
                    assertThat(rs.getString("id")).isNotBlank();
                    ids.add(rs.getString("id"));
                    assertThat(rs.getString("role")).isEqualTo(roles[rows]);
                    assertThat(rs.getLong("version")).isEqualTo(versions[rows]);
                    assertThat(rs.getObject("updated_at")).isNull();
                    assertThat(rs.getObject("updated_by")).isNull();
                    rows++;
                }
            }
            assertThat(rows).isEqualTo(5);
            assertThat(ids).hasSize(5);
        }
    }

    @Test
    void ownerIndexAndPrimaryKeyStillHoldAndNewMembershipsGetAnIdByDefault() throws Exception {
        flyway("7").migrate();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into app_user (firebase_uid, name, email) values"
                    + " ('uid-x1', 'X1', 'x1@primer.si'), ('uid-x2', 'X2', 'x2@primer.si')");
            statement.executeUpdate(
                    "insert into contact_group (id, title) values ('0193c4a2-7a1f-7c3e-9b1a-0000000000f1', 'Indeks')");
            statement.executeUpdate(
                    "insert into group_member (group_id, user_id, role)"
                            + " select '0193c4a2-7a1f-7c3e-9b1a-0000000000f1', id, 'OWNER' from app_user where firebase_uid = 'uid-x1'");

            try (ResultSet rs = statement.executeQuery(
                    "select id from group_member where group_id = '0193c4a2-7a1f-7c3e-9b1a-0000000000f1'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString(1)).isNotBlank();
            }
            assertThatThrownBy(() -> statement.executeUpdate("insert into group_member (group_id, user_id, role)"
                            + " select '0193c4a2-7a1f-7c3e-9b1a-0000000000f1', id, 'OWNER' from app_user"
                            + " where firebase_uid = 'uid-x2'"))
                    .hasMessageContaining("group_member_one_owner");
        }
    }

    @Test
    void updatedByIsClearedWhenTheUserIsDeletedAndMembershipsFollowTheirGroup() throws Exception {
        flyway("7").migrate();
        try (Connection connection = connect();
                Statement statement = connection.createStatement()) {
            statement.executeUpdate("insert into app_user (firebase_uid, name, email) values"
                    + " ('uid-y1', 'Y1', 'y1@primer.si'), ('uid-y2', 'Y2', 'y2@primer.si')");
            statement.executeUpdate(
                    "insert into contact_group (id, title) values ('0193c4a2-7a1f-7c3e-9b1a-0000000000f2', 'Sled')");
            statement.executeUpdate("insert into group_member (group_id, user_id, role, updated_at, updated_by)"
                    + " select '0193c4a2-7a1f-7c3e-9b1a-0000000000f2', a.id, 'VIEWER', now(), b.id"
                    + " from app_user a, app_user b where a.firebase_uid = 'uid-y1' and b.firebase_uid = 'uid-y2'");

            statement.executeUpdate("delete from app_user where firebase_uid = 'uid-y2'");
            try (ResultSet rs = statement.executeQuery("select updated_by, updated_at from group_member"
                    + " where group_id = '0193c4a2-7a1f-7c3e-9b1a-0000000000f2'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getObject("updated_by")).isNull();
                assertThat(rs.getObject("updated_at")).isNotNull();
            }
            statement.executeUpdate("delete from contact_group where id = '0193c4a2-7a1f-7c3e-9b1a-0000000000f2'");
            try (ResultSet rs = statement.executeQuery(
                    "select count(*) from group_member" + " where group_id = '0193c4a2-7a1f-7c3e-9b1a-0000000000f2'")) {
                rs.next();
                assertThat(rs.getInt(1)).isZero();
            }
        }
    }

    @Test
    void migratingAgainIsANoOp() {
        flyway("7").migrate();

        assertThat(flyway("7").migrate().migrationsExecuted).isZero();
    }
}
