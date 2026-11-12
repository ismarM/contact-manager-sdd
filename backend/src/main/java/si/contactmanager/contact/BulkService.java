package si.contactmanager.contact;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.AuditAction;
import si.contactmanager.audit.AuditLog;
import si.contactmanager.audit.ContactChange;
import si.contactmanager.contact.ContactSnapshots.Change;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.BulkValidationError.ContactErrors;
import si.contactmanager.shared.error.BulkValidationException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.SelectionChangedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Izbor vseh zadetkov, preverjanje sprememb izbora, množično urejanje in izbris (research R-02 … R-09, R-13). Dostop do
 * skupine, vloga in arhiviranost se preverijo v {@link BulkController} pred klicem; transakcije zaklenejo skupino in
 * kontakte (R-03) in v isti transakciji zapišejo en vnos sledi.
 */
@Service
class BulkService {

    private final ContactRepository contacts;
    private final ContactSnapshots snapshots;
    private final AuditLog audit;
    private final ContactService contactService;
    private final ContactQueryParser queryParser = new ContactQueryParser();

    BulkService(ContactRepository contacts, ContactSnapshots snapshots, AuditLog audit, ContactService contactService) {
        this.contacts = contacts;
        this.snapshots = snapshots;
        this.audit = audit;
        this.contactService = contactService;
    }

    /** »Izberi vse zadetke« (FR-009-03, FR-009-04): pri več kot 10 000 zadetkih samo število. */
    ContactIds contactIds(Membership membership, ContactQuery query) {
        contactService.requireKnownKeys(membership, query);
        long total = contacts.count(membership.groupId(), query);
        if (total > BulkInputParser.MAX_IDS) {
            return new ContactIds(total, true, List.of());
        }
        return new ContactIds(total, false, contacts.ids(membership.groupId(), query));
    }

    /**
     * Korak 2 (R-02): vsaka identiteta je kontakt te skupine ali je v njeni sledi (bil je); sicer {@code 404}, nič se ne
     * spremeni.
     */
    void requireKnown(Membership membership, Collection<UUID> ids) {
        Set<UUID> unknown = new LinkedHashSet<>(ids);
        unknown.removeAll(contacts.existing(membership.groupId(), ids));
        if (unknown.isEmpty()) {
            return;
        }
        unknown.removeAll(contacts.knownToGroup(membership.groupId(), unknown));
        if (!unknown.isEmpty()) {
            throw new NotFoundException();
        }
    }

    /** Preverjanje sprememb izbora (FR-009-18): samo branje. */
    SelectionCheck.Result check(Membership membership, SelectionCheck.Request request) {
        UUID group = membership.groupId();
        Set<UUID> all = new LinkedHashSet<>(request.contactIds());
        for (SelectionCheck.Query query : request.queries()) {
            all.addAll(query.contactIds());
            all.addAll(query.excludedIds());
        }
        Set<UUID> existing = contacts.existing(group, all);
        List<UUID> missing = request.contactIds().stream()
                .filter(id -> !existing.contains(id))
                .toList();
        Set<UUID> selected = new HashSet<>(request.contactIds());

        List<ContactQuery> parsed = new ArrayList<>();
        List<FieldError> errors = new ArrayList<>();
        for (int i = 0; i < request.queries().size(); i++) {
            ContactQuery query = parse(request.queries().get(i));
            for (FieldError error : contactService.unknownKeys(membership, query)) {
                errors.add(new FieldError("queries[" + i + "]." + error.field(), error.code()));
            }
            parsed.add(query);
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }

        boolean changed = !missing.isEmpty();
        List<SelectionCheck.QueryResult> results = new ArrayList<>();
        for (int i = 0; i < parsed.size(); i++) {
            SelectionCheck.Query query = request.queries().get(i);
            Set<UUID> matches = new LinkedHashSet<>(contacts.ids(group, parsed.get(i)));
            Set<UUID> excluded = new HashSet<>(query.excludedIds());
            List<UUID> newMatches = matches.stream()
                    .filter(id -> !selected.contains(id) && !excluded.contains(id))
                    .toList();
            List<UUID> noLonger = query.contactIds().stream()
                    .filter(id -> existing.contains(id) && !matches.contains(id))
                    .toList();
            changed |= !newMatches.isEmpty() || !noLonger.isEmpty();
            results.add(new SelectionCheck.QueryResult(newMatches, noLonger));
        }
        return new SelectionCheck.Result(changed, missing, results);
    }

    private ContactQuery parse(SelectionCheck.Query query) {
        Map<String, List<String>> parameters = new LinkedHashMap<>();
        if (query.q() != null) {
            parameters.put("q", List.of(query.q()));
        }
        parameters.put("f", query.f());
        parameters.put("tag", query.tag());
        ContactQueryParser.Parsed parsed = queryParser.parse(parameters);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        return parsed.query();
    }

    /** Množično urejanje (FR-009-06 … FR-009-12, FR-009-14, FR-009-16); vrne število spremenjenih kontaktov. */
    @Transactional
    int update(Membership membership, BulkEditInput edit) {
        UUID group = membership.groupId();
        lockWritable(group);
        Set<UUID> locked = contacts.lockExisting(group, edit.contactIds());
        Map<UUID, ContactState> states = snapshots.load(group, locked);
        Collator collator = collator();

        List<Change> changes = new ArrayList<>();
        List<ContactErrors> invalid = new ArrayList<>();
        for (UUID id : edit.contactIds()) {
            ContactState before = states.get(id);
            if (before == null) {
                continue;
            }
            ContactState after = BulkEdit.apply(before, edit);
            List<FieldError> violations = BulkEdit.violations(after);
            if (!violations.isEmpty()) {
                invalid.add(new ContactErrors(id, name(after), violations));
            } else if (BulkEdit.changed(before, after)) {
                changes.add(new Change(id, before, after));
            }
        }
        if (!invalid.isEmpty()) {
            invalid.sort(
                    Comparator.comparing(ContactErrors::displayName, collator).thenComparing(ContactErrors::contactId));
            throw new BulkValidationException(List.of(), invalid);
        }
        requireNoneMissing(edit.contactIds(), states.keySet());
        if (changes.isEmpty()) {
            return 0;
        }
        changes.sort(
                Comparator.comparing((Change c) -> name(c.after()), collator).thenComparing(Change::contactId));
        snapshots.replaceContent(group, membership.userId(), changes);
        Map<UUID, ContactState> written =
                snapshots.load(group, changes.stream().map(Change::contactId).toList());
        audit.record(
                group,
                membership.userId(),
                AuditAction.UPDATE,
                changes.stream()
                        .map(c -> new ContactChange(
                                c.contactId(), name(c.after()), c.before(), written.get(c.contactId())))
                        .toList());
        return changes.size();
    }

    /** Množični izbris (FR-009-13, FR-009-14); vrne število izbrisanih kontaktov. */
    @Transactional
    int delete(Membership membership, BulkTarget target) {
        UUID group = membership.groupId();
        lockWritable(group);
        Set<UUID> locked = contacts.lockExisting(group, target.contactIds());
        requireNoneMissing(target.contactIds(), locked);
        Map<UUID, ContactState> states = snapshots.load(group, locked);
        Collator collator = collator();
        List<UUID> ordered = new ArrayList<>(states.keySet());
        ordered.sort(Comparator.comparing((UUID id) -> name(states.get(id)), collator)
                .thenComparing(Comparator.naturalOrder()));
        int deleted = contacts.deleteAll(group, ordered);
        audit.record(
                group,
                membership.userId(),
                AuditAction.DELETE,
                ordered.stream()
                        .map(id -> new ContactChange(id, name(states.get(id)), states.get(id), null))
                        .toList());
        return deleted;
    }

    /** Zaklep skupine (R-03): počaka na sočasno arhiviranje; arhivirana → {@code 409 GROUP_ARCHIVED}. */
    private void lockWritable(UUID group) {
        boolean archived = contacts.lockGroupArchived(group).orElseThrow(NotFoundException::new);
        if (archived) {
            throw new GroupArchivedException();
        }
    }

    private static void requireNoneMissing(List<UUID> requested, Set<UUID> present) {
        List<UUID> missing =
                requested.stream().filter(id -> !present.contains(id)).toList();
        if (!missing.isEmpty()) {
            throw new SelectionChangedException(missing);
        }
    }

    private static String name(ContactState state) {
        return ContactRepository.displayName(state.firstName(), state.lastName());
    }

    private static Collator collator() {
        return Collator.getInstance(Locale.forLanguageTag("sl"));
    }
}
