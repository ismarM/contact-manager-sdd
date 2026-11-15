package si.contactmanager.audit;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.ContactHistoryRepository.Latest;
import si.contactmanager.audit.HistoryViews.Status;
import si.contactmanager.contact.ContactSnapshots;
import si.contactmanager.contact.ContactState;
import si.contactmanager.contact.RestoreRules;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.RestoreNoChangesException;
import si.contactmanager.shared.error.RestoreNotAllowedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Obnova enega kontakta (015, research R-05). Vse v eni transakciji pod zaklepom skupine (isti zaklep kot rollback in
 * druga pisanja): preverbe sočasnosti in poslovnih pravil, zamenjava samo tega kontakta in en vnos {@code RESTORE}.
 */
@Service
class RestoreService {

    /** Zahteva za obnovo: {@code from} je id vnosa ali {@code initial}; {@code version} ali {@code lastEntryId}. */
    record Request(String from, Long version, UUID lastEntryId) {}

    private final AuditRepository audit;
    private final ContactHistoryRepository history;
    private final ContactHistoryService service;
    private final ContactSnapshots snapshots;
    private final AuditLog log;
    private final RestoreRules rules;

    RestoreService(
            AuditRepository audit,
            ContactHistoryRepository history,
            ContactHistoryService service,
            ContactSnapshots snapshots,
            AuditLog log,
            RestoreRules rules) {
        this.rules = rules;
        this.audit = audit;
        this.history = history;
        this.service = service;
        this.snapshots = snapshots;
        this.log = log;
    }

    @Transactional
    AuditEntry restore(Membership membership, UUID contact, Request request) {
        UUID group = membership.groupId();
        if (audit.lockGroupArchived(group).orElseThrow(NotFoundException::new)) {
            throw new GroupArchivedException();
        }
        ContactHistoryService.Known known = service.known(membership, contact);
        service.resolve(group, contact, request.from(), false);
        boolean initial = "initial".equals(request.from());
        ContactState recorded =
                history.fullState(group, contact, request.from()).orElseThrow(NotFoundException::new);

        ContactState now = snapshots.snapshot(group, contact);
        UUID latest = known.latest().map(Latest::entryId).orElse(null);
        if (now != null) {
            if (request.version() == null) {
                // Odjemalec je kontakt videl kot izbrisanega, medtem je spet obstaja: sočasna obnova (FR-015-13).
                if (request.lastEntryId() != null) {
                    throw new VersionConflictException(
                            Map.of("version", now.version(), "latestEntryId", String.valueOf(latest)));
                }
                throw new ValidationException(List.of(new FieldError("version", "REQUIRED")));
            }
            if (request.version() != now.version()) {
                throw new VersionConflictException(
                        Map.of("version", now.version(), "latestEntryId", String.valueOf(latest)));
            }
        } else {
            if (request.lastEntryId() == null) {
                // Odjemalec je kontakt videl kot obstoječega, medtem je izbrisan: sočasna sprememba (FR-015-13).
                if (request.version() != null) {
                    throw new VersionConflictException(Map.of("latestEntryId", String.valueOf(latest)));
                }
                throw new ValidationException(List.of(new FieldError("lastEntryId", "REQUIRED")));
            }
            if (!request.lastEntryId().equals(latest)) {
                throw new VersionConflictException(Map.of("latestEntryId", String.valueOf(latest)));
            }
            if (known.status() == Status.MERGED) {
                throw new RestoreNotAllowedException();
            }
        }

        // Trenutna pravila 013 (država, podjetje, rezervirani ključi, kanonični zapis): zgodovina ostane dobesedna,
        // novo
        // stanje mora biti veljavno (research R-11).
        ContactState goal = rules.conform(group, recorded, now);
        if (now != null && RollbackService.sameContent(now, goal)) {
            throw new RestoreNoChangesException();
        }

        long previous = audit.maxVersions(group, List.of(contact)).getOrDefault(contact, -1L);
        long version = Math.max(now == null ? -1 : now.version(), previous) + 1;
        snapshots.restore(group, contact, goal, version, membership.userId(), now != null);
        ContactState after = snapshots.snapshot(group, contact);

        UUID entryTarget = initial ? null : UUID.fromString(request.from());
        UUID entry = log.recordRestore(
                group, membership.userId(), new ContactChange(contact, name(after), now, after), entryTarget, initial);
        return audit.find(group, entry).orElseThrow();
    }

    private static String name(ContactState state) {
        return ContactHistoryRepository.name(state.firstName(), state.lastName());
    }
}
