package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.contact.support.ImportApiTest;

/**
 * Sočasnost in atomarnost potrditve uvoza (FR-014-05; SC-008; konstitucija V): skupina, arhivirana ali zapuščena med
 * predogledom in potrditvijo, zavrne uvoz; preverjanje arhiva teče pod zaklepom skupine v isti transakciji kot vstavljanje;
 * napaka sredi zapisa ne pusti nobenega kontakta in nobenega vnosa sledi.
 */
@Tag("FR-014-05")
@Tag("SC-008")
class ImportConcurrencyIT extends ImportApiTest {

    private List<Map<String, Object>> three() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (String name : List.of("Prvi", "Drugi", "Pade")) {
            Map<String, Object> contact = person(name, "Kontakt");
            contact.put("tags", List.of("t-" + name));
            list.add(contact);
        }
        return list;
    }

    @Test
    void aGroupArchivedBetweenPreviewAndConfirmationRejectsTheImport() throws Exception {
        Scenario s = scenario();
        assertThat(preview(s.token(Who.EDITOR), s.group(), three()).statusCode())
                .isEqualTo(200);

        groups.archive(s.group());
        HttpResponse<String> response = commit(s.token(Who.EDITOR), s.group(), "XLSX", three());

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).isEqualTo(Map.of("code", "GROUP_ARCHIVED"));
        assertThat(contacts.count(s.group())).isZero();
        assertThat(audit.count(s.group())).isZero();
    }

    @Test
    void aMemberRemovedBetweenPreviewAndConfirmationGetsNotFound() throws Exception {
        Scenario s = scenario();
        assertThat(preview(s.token(Who.EDITOR), s.group(), three()).statusCode())
                .isEqualTo(200);

        jdbc.update("delete from group_member where group_id = ? and user_id = ?", s.group(), s.id(Who.EDITOR));
        HttpResponse<String> response = commit(s.token(Who.EDITOR), s.group(), "XLSX", three());

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(contacts.count(s.group())).isZero();
    }

    /**
     * Arhiviranje drži zaklep vrstice skupine in se potrdi šele, ko potrditev uvoza že čaka: uvoz mora videti potrjeno
     * arhiviranje (zaklep in preverjanje v isti transakciji kot vstavljanje), sicer bi po sprostitvi vstavil kontakte.
     */
    @Test
    void theArchiveCheckRunsUnderTheGroupLockInTheInsertingTransaction() throws Exception {
        Scenario s = scenario();
        CompletableFuture<HttpResponse<String>> pending;
        try (Connection holder = jdbc.getDataSource().getConnection()) {
            holder.setAutoCommit(false);
            try (PreparedStatement lock =
                    holder.prepareStatement("select 1 from contact_group where id = ? for update")) {
                lock.setObject(1, s.group());
                lock.executeQuery();
            }
            try (PreparedStatement archive =
                    holder.prepareStatement("update contact_group set archived_at = now() where id = ?")) {
                archive.setObject(1, s.group());
                archive.executeUpdate();
            }
            pending = CompletableFuture.supplyAsync(() -> {
                try {
                    return commit(s.token(Who.EDITOR), s.group(), "XLSX", three());
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            });
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (waitingOnLocks() < 1 && System.nanoTime() < deadline) {
                Thread.sleep(50);
            }
            assertThat(pending).as("potrditev mora čakati na zaklep skupine").isNotDone();
            holder.commit();
        }

        HttpResponse<String> response = pending.get(30, TimeUnit.SECONDS);

        assertThat(response.statusCode()).as(response.body()).isEqualTo(409);
        assertThat(contacts.count(s.group())).isZero();
        assertThat(audit.count(s.group())).isZero();
    }

    /** Napaka pri vstavljanju značk (po kontaktih) ali vnosa sledi (po vseh kontaktih) razveljavi celoten uvoz. */
    @ParameterizedTest(name = "napaka v {0}")
    @ValueSource(strings = {"contact_tag", "audit_entry"})
    void aFailureInTheMiddleOfTheWriteLeavesNothing(String table) throws Exception {
        Scenario s = scenario();
        String name = "fail_" + UUID.randomUUID().toString().replace("-", "");
        String condition = table.equals("contact_tag")
                ? "NEW.tag = 't-Pade'"
                : "NEW.group_id = '" + s.group() + "' and NEW.action = 'IMPORT'";
        jdbc.execute("create function " + name + "() returns trigger language plpgsql as $$ begin if " + condition
                + " then raise exception 'izzvana napaka uvoza'; end if; return NEW; end $$");
        jdbc.execute("create trigger " + name + " before insert on " + table + " for each row execute function " + name
                + "()");
        try {
            HttpResponse<String> response = commit(s.token(Who.EDITOR), s.group(), "XLSX", three());

            assertThat(response.statusCode()).isEqualTo(500);
            assertThat(contacts.count(s.group())).isZero();
            assertThat(audit.count(s.group())).isZero();
            assertThat(jdbc.queryForObject(
                            "select count(*) from contact_tag where tag like 't-%' and contact_id not in"
                                    + " (select id from contact)",
                            Integer.class))
                    .isZero();
        } finally {
            jdbc.execute("drop trigger if exists " + name + " on " + table);
            jdbc.execute("drop function if exists " + name + "()");
        }

        assertThat(commit(s.token(Who.EDITOR), s.group(), "XLSX", three()).statusCode())
                .isEqualTo(201);
        assertThat(contacts.count(s.group())).isEqualTo(3);
    }

    private int waitingOnLocks() {
        Integer count = jdbc.queryForObject(
                "select count(*) from pg_stat_activity where datname = current_database()"
                        + " and wait_event_type = 'Lock' and state = 'active'",
                Integer.class);
        return count == null ? 0 : count;
    }
}
