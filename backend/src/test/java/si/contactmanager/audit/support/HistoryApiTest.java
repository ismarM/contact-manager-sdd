package si.contactmanager.audit.support;

import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.audit.AuditAction;
import si.contactmanager.audit.AuditLog;
import si.contactmanager.audit.ContactChange;
import si.contactmanager.contact.ContactSnapshots;
import si.contactmanager.contact.ContactState;

/** Osnova testov 015: poti zgodovine, različic, primerjave, obnove in izbrisanih kontaktov ter ročno zapisana združitev. */
public abstract class HistoryApiTest extends AuditApiTest {

    @Autowired
    protected AuditLog auditLog;

    @Autowired
    protected ContactSnapshots snapshots;

    @Autowired
    protected PlatformTransactionManager transactions;

    protected static String historyPath(UUID group, Object contact) {
        return contactPath(group, contact) + "/history";
    }

    protected static String versionPath(UUID group, Object contact, Object ref) {
        return contactPath(group, contact) + "/versions/" + ref;
    }

    protected static String comparePath(UUID group, Object contact) {
        return contactPath(group, contact) + "/compare";
    }

    protected static String previewPath(UUID group, Object contact) {
        return contactPath(group, contact) + "/restore-preview";
    }

    protected static String restorePath(UUID group, Object contact) {
        return contactPath(group, contact) + "/restore";
    }

    protected static String deletedPath(UUID group) {
        return "/api/groups/" + group + "/deleted-contacts";
    }

    protected static String actorsPath(UUID group) {
        return auditPath(group) + "/actors";
    }

    /** Telo obnove obstoječega kontakta. */
    protected static Map<String, Object> restoreBody(Object from, long version) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", from.toString());
        body.put("version", version);
        return body;
    }

    /** Telo obnove izbrisanega kontakta. */
    protected static Map<String, Object> restoreDeletedBody(Object from, Object lastEntryId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("from", from.toString());
        body.put("lastEntryId", lastEntryId.toString());
        return body;
    }

    protected HttpResponse<String> restore(Scenario s, Who who, UUID contact, Map<String, Object> body)
            throws Exception {
        return post(restorePath(s.group(), contact), s.token(who), body(body));
    }

    protected Map<String, Object> history(Scenario s, Who who, UUID contact, String query) throws Exception {
        HttpResponse<String> response = get(historyPath(s.group(), contact) + query, s.token(who));
        if (response.statusCode() != 200) {
            throw new IllegalStateException("history vrnil " + response.statusCode() + ": " + response.body());
        }
        return json(response.body());
    }

    protected Map<String, Object> deleted(Scenario s, Who who, String query) throws Exception {
        HttpResponse<String> response = get(deletedPath(s.group()) + query, s.token(who));
        if (response.statusCode() != 200) {
            throw new IllegalStateException("deleted vrnil " + response.statusCode() + ": " + response.body());
        }
        return json(response.body());
    }

    /** Vrednosti kontakta za urejanje s spremenjenim telefonom. */
    protected static Map<String, Object> withPhone(Map<String, Object> detail, String phone) {
        Map<String, Object> values = valuesOf(detail);
        values.put("phone", phone);
        return values;
    }

    /** Id-ji vnosov sledi po seq naraščajoče. */
    protected List<UUID> entryIds(Scenario s) {
        return audit.entries(s.group()).stream().map(e -> (UUID) e.get("id")).toList();
    }

    private static String nameOf(ContactState state) {
        return state.firstName() + " " + state.lastName();
    }

    /**
     * Zapiše vnos {@code MERGE} (ohranjeni kontakt prej in potem, odstranjeni samo prej) in odstrani odstranjeni kontakt,
     * kot to stori združevanje 011; vrne id vnosa.
     */
    protected UUID mergeInto(Scenario s, UUID keeper, UUID removed, long actor) {
        UUID group = s.group();
        ContactState keeperBefore = snapshots.snapshot(group, keeper);
        ContactState removedBefore = snapshots.snapshot(group, removed);
        ContactState keeperAfter = new ContactState(
                keeperBefore.firstName(),
                keeperBefore.lastName(),
                keeperBefore.address(),
                keeperBefore.email(),
                keeperBefore.phone(),
                keeperBefore.company(),
                keeperBefore.country(),
                keeperBefore.attributes(),
                keeperBefore.tags(),
                keeperBefore.version() + 1,
                keeperBefore.createdAt(),
                keeperBefore.updatedAt(),
                keeperBefore.updatedById());
        jdbc.update("update contact set version = ? where id = ?", keeperAfter.version(), keeper);
        jdbc.update("delete from contact where id = ?", removed);
        return new TransactionTemplate(transactions)
                .execute(status -> auditLog.record(
                        group,
                        actor,
                        AuditAction.MERGE,
                        List.of(
                                new ContactChange(keeper, nameOf(keeperBefore), keeperBefore, keeperAfter),
                                new ContactChange(removed, nameOf(removedBefore), removedBefore, null))));
    }
}
