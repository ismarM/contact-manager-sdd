package si.contactmanager.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.audit.support.AuditApiTest;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.ContactState;

/**
 * Rollback na točko v sledi (FR-005-11, -12, -13, -19, -20; SC-002, SC-003): stanje kontaktov takoj po vnosu T se
 * obnovi, rollback je nov vnos, verzije rastejo, kontakti izpred beleženja ostanejo nedotaknjeni.
 */
class AuditRollbackIT extends AuditApiTest {

    @Autowired
    private AuditLog auditLog;

    @Autowired
    private PlatformTransactionManager transactions;

    private UUID entryAt(Scenario s, int index) {
        return (UUID) audit.entries(s.group()).get(index).get("id");
    }

    private Map<String, Object> contactDetail(Scenario s, UUID id) throws Exception {
        HttpResponse<String> response = get(contactPath(s.group(), id), s.token(Who.VIEWER));
        assertThat(response.statusCode()).isEqualTo(200);
        return json(response.body());
    }

    /** Stanje iz odgovora API-ja, kot ga zapiše sled (za ročno zapisane vnose). */
    private ContactState stateOf(Map<String, Object> detail, Long updatedById, long version) {
        List<Attribute> attributes = new ArrayList<>();
        for (Map<String, Object> a : asObjects(detail.get("attributes"))) {
            attributes.add(new Attribute((String) a.get("key"), (String) a.get("value")));
        }
        return new ContactState(
                (String) detail.get("firstName"),
                (String) detail.get("lastName"),
                (String) detail.get("address"),
                (String) detail.get("email"),
                (String) detail.get("phone"),
                attributes,
                asStrings(detail.get("tags")),
                version,
                Instant.parse((String) detail.get("createdAt")),
                Instant.parse((String) detail.get("updatedAt")),
                updatedById);
    }

    /** Vsebina kontakta v bazi brez metapodatkov – za primerjavo s posnetki. */
    private Map<String, Object> content(UUID contact) {
        Map<String, Object> state = audit.contactState(contact);
        if (state.isEmpty()) {
            return null;
        }
        Map<String, Object> content = new LinkedHashMap<>();
        for (String key : List.of("first_name", "last_name", "address", "email", "phone", "attributes", "tags")) {
            content.put(key, state.get(key));
        }
        return content;
    }

    @Test
    @Tag("FR-005-11")
    @Tag("FR-005-12")
    @Tag("FR-005-13")
    void rollbackRestoresTheStateRightAfterTheTargetEntry() throws Exception {
        Scenario s = scenario();
        UUID untracked = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        Map<String, Object> untrackedRow = contacts.row(untracked);
        Map<String, Object> inputC = contactInput("Cene", "Cerar", "01 333 333");
        inputC.put("attributes", List.of(Map.of("key", "oddelek", "value", "IT")));
        inputC.put("tags", List.of("vip", "stari"));
        Map<String, Object> c = create(s, Who.EDITOR, inputC);
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = entryAt(s, 1);
        Map<String, Object> afterTarget = contactDetail(s, idOf(a));
        Map<String, Object> b = create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "01 222 222"));
        Map<String, Object> editedA = valuesOf(a);
        editedA.put("phone", "031 999 999");
        Map<String, Object> updatedA = update(s, Who.ADMIN, idOf(a), editedA, versionOf(a));
        remove(s, Who.EDITOR, idOf(c), versionOf(c));
        assertThat(audit.count(s.group())).isEqualTo(5);

        HttpResponse<String> response = rollback(s, Who.ADMIN, target, audit.latestEntryId(s.group()));

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> entry = json(response.body());
        assertThat(entry).containsEntry("action", "ROLLBACK").containsEntry("contactCount", 3);
        assertThat(entry).containsEntry("targetInitial", false);
        assertThat(asObject(entry.get("target"))).containsEntry("entryId", target.toString());
        assertThat(audit.count(s.group())).isEqualTo(6);
        assertThat(audit.entries(s.group()).get(5).get("id").toString()).isEqualTo(entry.get("id"));
        assertThat(audit.latestEntryId(s.group()).toString()).isEqualTo(entry.get("id"));
        // B ne obstaja, A ima vrednosti takoj po T, C je obnovljen z istim id in vsemi podatki.
        assertThat(contacts.exists(idOf(b))).isFalse();
        Map<String, Object> restoredA = contactDetail(s, idOf(a));
        assertThat(restoredA)
                .containsEntry("phone", "01 111 111")
                .containsEntry("createdAt", afterTarget.get("createdAt"));
        Map<String, Object> restoredC = contactDetail(s, idOf(c));
        assertThat(restoredC)
                .containsEntry("id", c.get("id"))
                .containsEntry("firstName", "Cene")
                .containsEntry("phone", "01 333 333")
                .containsEntry("attributes", List.of(Map.of("key", "oddelek", "value", "IT")))
                .containsEntry("tags", List.of("vip", "stari"))
                .containsEntry("createdAt", c.get("createdAt"));
        // Kontakt izpred beleženja je nespremenjen.
        assertThat(contacts.row(untracked)).isEqualTo(untrackedRow);
        // Nov vnos ima spremembe samo za A (CHANGED), B (REMOVED) in C (ADDED).
        String entryId = (String) entry.get("id");
        Map<String, Object> changes = json(get(entryPath(s.group(), entryId) + "/changes", s.token(Who.VIEWER))
                .body());
        assertThat(asObjects(changes.get("items")))
                .extracting(i -> i.get("kind"), i -> i.get("contactId"))
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("CHANGED", a.get("id")),
                        org.assertj.core.groups.Tuple.tuple("REMOVED", b.get("id")),
                        org.assertj.core.groups.Tuple.tuple("ADDED", c.get("id")));
        // Verzija je večja od vseh prejšnjih verzij kontakta; zastarela verzija je konflikt.
        assertThat(versionOf(restoredA)).isGreaterThan(versionOf(updatedA));
        assertThat(versionOf(restoredC)).isGreaterThan(versionOf(c));
        Map<String, Object> stale = valuesOf(restoredA);
        stale.put("phone", "040 000 000");
        HttpResponse<String> conflict = put(
                contactPath(s.group(), idOf(a)), s.token(Who.EDITOR), body(withVersion(stale, versionOf(updatedA))));
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(json(conflict.body())).containsEntry("code", "VERSION_CONFLICT");
    }

    @Test
    @Tag("FR-005-19")
    void rollbackSetsTheLastChangeFromTheTargetStateAndTheRevertedMarker() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = entryAt(s, 0);
        Map<String, Object> afterTarget = contactDetail(s, idOf(a));
        Map<String, Object> edited = valuesOf(a);
        edited.put("phone", "031 999 999");
        update(s, Who.ADMIN, idOf(a), edited, versionOf(a));

        Map<String, Object> entry = rollbackToEntry(s, target);

        Map<String, Object> detail = contactDetail(s, idOf(a));
        assertThat(asObject(detail.get("updatedBy")))
                .containsEntry("email", groups.email(s.users().get(Who.EDITOR).uid()));
        assertThat(detail).containsEntry("updatedAt", afterTarget.get("updatedAt"));
        Map<String, Object> reverted = asObject(detail.get("reverted"));
        assertThat(reverted)
                .containsEntry("rollbackEntryId", entry.get("id"))
                .containsEntry("targetEntryId", target.toString())
                .containsEntry("targetInitial", false);
        assertThat(reverted.get("rolledBackAt")).isEqualTo(entry.get("createdAt"));
        assertThat(reverted.get("targetAt")).isNotNull();
        assertThat(asObject(reverted.get("rolledBackBy")))
                .containsEntry("email", groups.email(s.users().get(Who.ADMIN).uid()));
        assertThat(audit.contactState(idOf(a)))
                .containsEntry("reverted_entry_id", UUID.fromString((String) entry.get("id")));
        List<Map<String, Object>> items = asObjects(
                json(get(contactsPath(s.group()), s.token(Who.VIEWER)).body()).get("items"));
        assertThat(items.get(0)).containsEntry("reverted", true);

        // Vsaka druga uspešna operacija oznako izbriše.
        Map<String, Object> again = valuesOf(detail);
        again.put("phone", "040 000 000");
        update(s, Who.EDITOR, idOf(a), again, versionOf(detail));
        assertThat(contactDetail(s, idOf(a))).containsEntry("reverted", null);
        assertThat(asObjects(json(get(contactsPath(s.group()), s.token(Who.VIEWER))
                                        .body())
                                .get("items"))
                        .get(0))
                .containsEntry("reverted", false);
    }

    @Test
    @Tag("FR-005-19")
    void aDeletedAccountOfTheTargetStateGivesNoLastChanger() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = entryAt(s, 0);
        Map<String, Object> edited = valuesOf(a);
        edited.put("phone", "031 999 999");
        update(s, Who.ADMIN, idOf(a), edited, versionOf(a));
        jdbc.update("delete from app_user where id = ?", s.id(Who.EDITOR));

        rollbackToEntry(s, target);

        Map<String, Object> detail = contactDetail(s, idOf(a));
        assertThat(detail).containsEntry("updatedBy", null).containsEntry("phone", "01 111 111");
        assertThat(audit.contactState(idOf(a))).containsEntry("updated_by", null);
    }

    @Test
    @Tag("FR-005-11")
    void aContactEditedManyTimesAndThenDeletedIsRestoredToTheStateRightAfterTheTarget() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = entryAt(s, 0);
        Map<String, Object> second = update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        Map<String, Object> third =
                update(s, Who.EDITOR, idOf(a), contactValues(second, "03 333 333"), versionOf(second));
        remove(s, Who.EDITOR, idOf(a), versionOf(third));
        assertThat(contacts.exists(idOf(a))).isFalse();

        rollbackToEntry(s, target);

        Map<String, Object> restored = contactDetail(s, idOf(a));
        assertThat(restored).containsEntry("phone", "01 111 111").containsEntry("firstName", "Ana");
        assertThat(versionOf(restored)).isGreaterThan(versionOf(third));
    }

    private Map<String, Object> contactValues(Map<String, Object> detail, String phone) {
        Map<String, Object> values = valuesOf(detail);
        values.put("phone", phone);
        return values;
    }

    @Test
    @Tag("FR-005-12")
    void rollbackToTheEntryBeforeARollbackUndoesItAndToARollbackEntryRestoresItsState() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> second = update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        update(s, Who.EDITOR, idOf(a), contactValues(second, "03 333 333"), versionOf(second));
        UUID beforeRollback = entryAt(s, 2);
        UUID createEntry = entryAt(s, 0);

        Map<String, Object> first = rollbackToEntry(s, createEntry);
        assertThat(contactDetail(s, idOf(a))).containsEntry("phone", "01 111 111");
        Map<String, Object> undo = rollbackToEntry(s, beforeRollback);
        assertThat(contactDetail(s, idOf(a))).containsEntry("phone", "03 333 333");
        Map<String, Object> toRollbackEntry = rollbackToEntry(s, UUID.fromString((String) first.get("id")));

        assertThat(contactDetail(s, idOf(a))).containsEntry("phone", "01 111 111");
        assertThat(undo).containsEntry("action", "ROLLBACK");
        assertThat(toRollbackEntry).containsEntry("action", "ROLLBACK");
        assertThat(audit.count(s.group())).isEqualTo(6);
    }

    @Test
    @Tag("FR-005-11")
    void rollbackToTheFirstEntryKeepsContactsFromBeforeTheTrail() throws Exception {
        Scenario s = scenario();
        UUID untracked = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja");
        Map<String, Object> untrackedRow = contacts.row(untracked);
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        create(s, Who.EDITOR, contactInput("Bojan", "Drugi", "01 222 222"));
        update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));

        rollbackToEntry(s, entryAt(s, 0));

        assertThat(contacts.count(s.group())).isEqualTo(2);
        assertThat(contacts.row(untracked)).isEqualTo(untrackedRow);
        assertThat(contactDetail(s, idOf(a))).containsEntry("phone", "01 111 111");
    }

    /** Združevanje (011) zapiše vnos MERGE prek {@code AuditLog.record}; tu ga simulira test v transakciji. */
    private UUID merge(Scenario s, Map<String, Object> kept, Map<String, Object> x, Map<String, Object> y) {
        long editor = s.id(Who.EDITOR);
        ContactState keptBefore = stateOf(kept, editor, versionOf(kept));
        ContactState keptAfter = new ContactState(
                keptBefore.firstName(),
                keptBefore.lastName(),
                keptBefore.address(),
                keptBefore.email(),
                "01 777 777",
                keptBefore.attributes(),
                keptBefore.tags(),
                keptBefore.version() + 1,
                keptBefore.createdAt(),
                Instant.parse("2026-11-08T10:00:00Z"),
                editor);
        return new TransactionTemplate(transactions).execute(status -> {
            jdbc.update(
                    "update contact set phone = '01 777 777', version = version + 1, updated_at = ?, updated_by = ?"
                            + " where id = ?",
                    Timestamp.from(keptAfter.updatedAt()),
                    editor,
                    idOf(kept));
            jdbc.update("delete from contact where id in (?, ?)", idOf(x), idOf(y));
            return auditLog.record(
                    s.group(),
                    editor,
                    AuditAction.MERGE,
                    List.of(
                            new ContactChange(idOf(kept), "Janez Novak", keptBefore, keptAfter),
                            new ContactChange(idOf(x), "J. Novak", stateOf(x, editor, versionOf(x)), null),
                            new ContactChange(idOf(y), "Janez N.", stateOf(y, editor, versionOf(y)), null)));
        });
    }

    @Test
    @Tag("FR-005-11")
    @Tag("FR-005-12")
    void rollbackAroundAMergeEntryRestoresTheRemovedContactsOrKeepsThemRemoved() throws Exception {
        Scenario s = scenario();
        Map<String, Object> kept = create(s, Who.EDITOR, contactInput("Janez", "Novak", "01 111 111"));
        Map<String, Object> x = create(s, Who.EDITOR, contactInput("J.", "Novak", "01 222 222"));
        Map<String, Object> y = create(s, Who.EDITOR, contactInput("Janez", "N.", "01 333 333"));
        UUID beforeMerge = entryAt(s, 2);
        UUID mergeEntry = merge(s, kept, x, y);
        Map<String, Object> keptAfterMerge = contactDetail(s, idOf(kept));
        update(s, Who.EDITOR, idOf(kept), contactValues(keptAfterMerge, "04 444 444"), versionOf(keptAfterMerge));
        assertThat(audit.entries(s.group())).extracting(e -> e.get("action")).contains("MERGE");

        rollbackToEntry(s, mergeEntry);

        assertThat(contactDetail(s, idOf(kept))).containsEntry("phone", "01 777 777");
        assertThat(contacts.exists(idOf(x))).isFalse();
        assertThat(contacts.exists(idOf(y))).isFalse();

        rollbackToEntry(s, beforeMerge);

        assertThat(contactDetail(s, idOf(kept))).containsEntry("phone", "01 111 111");
        assertThat(contactDetail(s, idOf(x))).containsEntry("id", x.get("id")).containsEntry("phone", "01 222 222");
        assertThat(contactDetail(s, idOf(y))).containsEntry("id", y.get("id")).containsEntry("phone", "01 333 333");
    }

    @Test
    @Tag("FR-005-20")
    void rollbackToTheInitialStateRemovesContactsCreatedInTheTrailAndRestoresThoseDeletedFirst() throws Exception {
        Scenario s = scenario();
        UUID untracked = contacts.insert(s.group(), s.id(Who.OWNER), "Izpred", "Beleženja", null, "01 000 000", null);
        UUID kept = contacts.insert(s.group(), s.id(Who.OWNER), "Ostane", "Nedotaknjen");
        Map<String, Object> keptRow = contacts.row(kept);
        Map<String, Object> created = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        Map<String, Object> untrackedDetail = contactDetail(s, untracked);
        remove(s, Who.EDITOR, untracked, versionOf(untrackedDetail));
        assertThat(contacts.exists(untracked)).isFalse();

        HttpResponse<String> response = rollbackInitial(s, Who.ADMIN, audit.latestEntryId(s.group()));

        assertThat(response.statusCode()).isEqualTo(201);
        Map<String, Object> entry = json(response.body());
        assertThat(entry).containsEntry("action", "ROLLBACK").containsEntry("targetInitial", true);
        assertThat(entry).containsEntry("target", null);
        assertThat(contacts.exists(idOf(created))).isFalse();
        assertThat(contactDetail(s, untracked))
                .containsEntry("phone", "01 000 000")
                .containsEntry("lastName", "Beleženja");
        assertThat(contacts.row(kept)).isEqualTo(keptRow);
        assertThat(asObject(contactDetail(s, untracked).get("reverted")))
                .containsEntry("targetInitial", true)
                .containsEntry("targetEntryId", null)
                .containsEntry("targetAt", null);
    }

    private record Run(List<UUID> entries, List<Map<Integer, Map<String, Object>>> snapshots, List<UUID> slots) {}

    @Test
    @Tag("FR-005-11")
    void rollbackToAnyPointOfARandomSequenceOfSixtyOperationsRestoresTheRecordedState() throws Exception {
        List<Integer> targets = List.of(3, 17, 29, 44, 58);
        for (int target : targets) {
            Scenario s = scenario();
            slotIds.clear();
            Run run = runSequence(s, 20261108L, 60);
            Map<Integer, Map<String, Object>> expected = run.snapshots().get(target);

            Map<String, Object> entry = rollbackToEntry(s, run.entries().get(target));

            assertThat(entry).containsEntry("action", "ROLLBACK");
            Map<Integer, Map<String, Object>> actual = new LinkedHashMap<>();
            for (Map.Entry<Integer, List<UUID>> slot : slotIds.entrySet()) {
                for (UUID id : slot.getValue()) {
                    if (contacts.exists(id)) {
                        actual.put(slot.getKey(), content(id));
                    }
                }
            }
            assertThat(actual).as("stanje po rollbacku na vnos %d", target + 1).isEqualTo(expected);
            assertThat(contacts.count(s.group())).isEqualTo(expected.size());
        }
    }

    /** Vsi id-ji kontaktov vsakega rezina po času (obnovljeni kontakti ohranijo id; naenkrat obstaja največ eden). */
    private final Map<Integer, List<UUID>> slotIds = new LinkedHashMap<>();

    /** Operacije nad 15 kontakti po fiksnem semenu; vrne vnose po vrstnem redu in posnetke vsebine po vsakem. */
    private Run runSequence(Scenario s, long seed, int operations) throws Exception {
        Random random = new Random(seed);
        int slotCount = 15;
        UUID[] slots = new UUID[slotCount];
        List<Map<String, Object>> details = new ArrayList<>(java.util.Collections.nCopies(slotCount, null));
        List<Map<Integer, Map<String, Object>>> snapshots = new ArrayList<>();
        for (int i = 0; i < operations; i++) {
            int slot = random.nextInt(slotCount);
            int kind = random.nextInt(10);
            if (slots[slot] == null) {
                details.set(
                        slot,
                        create(
                                s,
                                Who.EDITOR,
                                contactInput("Ime" + slot + "-" + i, "Priimek" + slot, "01 " + random.nextInt(900))));
                slots[slot] = idOf(details.get(slot));
                slotIds.computeIfAbsent(slot, key -> new ArrayList<>()).add(slots[slot]);
            } else if (kind < 7) {
                Map<String, Object> values = valuesOf(details.get(slot));
                values.put("phone", "0" + random.nextInt(9) + " " + random.nextInt(900) + " " + i);
                values.put("tags", random.nextBoolean() ? List.of("t" + random.nextInt(5)) : List.of());
                values.put(
                        "attributes",
                        random.nextBoolean()
                                ? List.of(Map.of("key", "k" + random.nextInt(3), "value", "v" + i))
                                : List.of());
                details.set(slot, update(s, Who.EDITOR, slots[slot], values, versionOf(details.get(slot))));
            } else {
                remove(s, Who.EDITOR, slots[slot], versionOf(details.get(slot)));
                slots[slot] = null;
            }
            Map<Integer, Map<String, Object>> snapshot = new LinkedHashMap<>();
            for (int k = 0; k < slotCount; k++) {
                if (slots[k] != null) {
                    snapshot.put(k, content(slots[k]));
                }
            }
            snapshots.add(snapshot);
        }
        List<UUID> entries =
                audit.entries(s.group()).stream().map(e -> (UUID) e.get("id")).toList();
        return new Run(entries, snapshots, new ArrayList<>(java.util.Arrays.asList(slots)));
    }

    @Test
    @Tag("FR-005-11")
    void rollingBackAThousandContactsOutOfTenThousandTakesUnderTenSeconds() throws Exception {
        Scenario s = scenario();
        Map<String, Object> first = create(s, Who.EDITOR, contactInput("Prvi", "Kontakt", "01 000 001"));
        UUID target = entryAt(s, 0);
        List<UUID> ids = contacts.insertMany(s.group(), s.id(Who.EDITOR), 10_000);
        List<UUID> affected = ids.subList(0, 1000);
        List<ContactChange> changes = new ArrayList<>();
        for (UUID id : affected) {
            Map<String, Object> row = jdbc.queryForMap(
                    "select first_name, last_name, version, created_at, updated_at from contact where id = ?", id);
            ContactState before = new ContactState(
                    (String) row.get("first_name"),
                    (String) row.get("last_name"),
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(),
                    ((Number) row.get("version")).longValue(),
                    ((Timestamp) row.get("created_at")).toInstant(),
                    ((Timestamp) row.get("updated_at")).toInstant(),
                    s.id(Who.EDITOR));
            ContactState after = new ContactState(
                    before.firstName(),
                    before.lastName(),
                    null,
                    null,
                    "031 000 000",
                    List.of(),
                    List.of(),
                    before.version() + 1,
                    before.createdAt(),
                    Instant.parse("2026-11-08T10:00:00Z"),
                    s.id(Who.EDITOR));
            changes.add(new ContactChange(id, before.firstName() + " " + before.lastName(), before, after));
        }
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            jdbc.update("update contact set phone = '031 000 000', version = version + 1 where id = any (?)", (Object)
                    affected.toArray(new UUID[0]));
            auditLog.record(s.group(), s.id(Who.EDITOR), AuditAction.UPDATE, changes);
        });
        assertThat(first).isNotEmpty();

        long start = System.nanoTime();
        HttpResponse<String> response = rollback(s, Who.ADMIN, target, audit.latestEntryId(s.group()));
        long seconds = (System.nanoTime() - start) / 1_000_000_000;

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(seconds).as("trajanje rollbacka v s").isLessThan(10);
        UUID entry = UUID.fromString((String) json(response.body()).get("id"));
        assertThat(audit.changes(entry)).hasSize(1000);
        assertThat(jdbc.queryForObject(
                        "select count(*) from contact where group_id = ? and phone = '031 000 000'",
                        Integer.class,
                        s.group()))
                .isZero();
        assertThat(contacts.count(s.group())).isEqualTo(10_001);
    }

    @Test
    @Tag("FR-005-11")
    void aTrackedContactNotChangedAfterTheTargetIsLeftAloneAndAbsentFromTheRollbackEntry() throws Exception {
        Scenario s = scenario();
        Map<String, Object> bystander = create(s, Who.EDITOR, contactInput("Dana", "Mirna", "01 000 000"));
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = entryAt(s, 1);
        update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        Map<String, Object> rowBefore = contacts.row(idOf(bystander));

        Map<String, Object> entry = rollbackToEntry(s, target);

        assertThat(entry).containsEntry("contactCount", 1);
        assertThat(contacts.row(idOf(bystander))).isEqualTo(rowBefore);
        assertThat(audit.contactState(idOf(bystander))).containsEntry("reverted_entry_id", null);
        UUID rollbackEntry = UUID.fromString((String) entry.get("id"));
        assertThat(audit.changes(rollbackEntry))
                .extracting(c -> c.get("contact_id"))
                .containsExactly(idOf(a));
    }

    @Test
    @Tag("FR-005-13")
    void deletingWithAVersionFromBeforeTheRollbackIsAConflict() throws Exception {
        Scenario s = scenario();
        Map<String, Object> a = create(s, Who.EDITOR, contactInput("Ana", "Prva", "01 111 111"));
        UUID target = entryAt(s, 0);
        Map<String, Object> second = update(s, Who.EDITOR, idOf(a), contactValues(a, "02 222 222"), versionOf(a));
        rollbackToEntry(s, target);

        HttpResponse<String> response =
                delete(contactPath(s.group(), idOf(a)) + "?version=" + versionOf(second), s.token(Who.EDITOR));

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(json(response.body())).containsEntry("code", "VERSION_CONFLICT");
        assertThat(contacts.exists(idOf(a))).isTrue();
    }
}
