package si.contactmanager.audit;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.contact.ContactSnapshots;
import si.contactmanager.contact.ContactState;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.RollbackNoChangesException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Rollback skupine na stanje takoj po izbranem vnosu ali na {@code Začetno stanje} (FR-005-11 … FR-005-15, -20;
 * research R-04, R-05). Vse v eni transakciji: zaklep skupine (izključi sočasna pisanja in arhiviranje), zaklep glave
 * sledi, primerjava najnovejšega vnosa, izračun razlik, uveljavitev in vnos {@code ROLLBACK}.
 */
@Service
class RollbackService {

    private final AuditRepository repository;
    private final AuditLog log;
    private final ContactSnapshots snapshots;

    RollbackService(AuditRepository repository, AuditLog log, ContactSnapshots snapshots) {
        this.repository = repository;
        this.log = log;
        this.snapshots = snapshots;
    }

    /** {@code target == null}: rollback na {@code Začetno stanje}. Vrne nov vnos rollbacka. */
    @Transactional
    AuditEntry rollback(Membership membership, UUID target, UUID latestEntryId) {
        UUID group = membership.groupId();
        if (repository.lockGroupArchived(group).orElseThrow(NotFoundException::new)) {
            throw new GroupArchivedException();
        }
        UUID head = repository.lockHead(group).orElseThrow(RollbackNoChangesException::new);
        if (!head.equals(latestEntryId)) {
            throw new VersionConflictException(Map.of("latestEntryId", head));
        }
        long seq = target == null ? 0 : repository.seqOf(group, target).orElseThrow(NotFoundException::new);

        Map<UUID, ContactState> wanted = repository.statesAfter(group, seq);
        Map<UUID, ContactState> current = snapshots.load(group, wanted.keySet());
        Map<UUID, Long> versions = repository.maxVersions(group, wanted.keySet());
        Set<Long> users = repository.existingUsers(wanted.values().stream()
                .filter(Objects::nonNull)
                .map(ContactState::updatedById)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet()));

        List<ContactChange> changes = new ArrayList<>();
        List<ContactSnapshots.Target> targets = new ArrayList<>();
        for (Map.Entry<UUID, ContactState> entry : wanted.entrySet()) {
            UUID id = entry.getKey();
            ContactState goal = entry.getValue();
            ContactState now = current.get(id);
            if (goal == null) {
                if (now != null) {
                    changes.add(new ContactChange(id, name(now), now, null));
                    targets.add(new ContactSnapshots.Target(id, null, true));
                }
                continue;
            }
            if (now != null && sameContent(now, goal)) {
                continue;
            }
            long version = Math.max(now == null ? -1 : now.version(), versions.getOrDefault(id, -1L)) + 1;
            Long by = goal.updatedById() != null && users.contains(goal.updatedById()) ? goal.updatedById() : null;
            ContactState after = new ContactState(
                    goal.firstName(),
                    goal.lastName(),
                    goal.address(),
                    goal.email(),
                    goal.phone(),
                    goal.attributes(),
                    goal.tags(),
                    version,
                    goal.createdAt(),
                    goal.updatedAt(),
                    by);
            changes.add(new ContactChange(id, name(after), now, after));
            targets.add(new ContactSnapshots.Target(id, after, now != null));
        }
        if (changes.isEmpty()) {
            throw new RollbackNoChangesException();
        }
        UUID entry = log.recordRollback(group, membership.userId(), changes, target, target == null);
        snapshots.apply(group, entry, targets);
        return repository.find(group, entry).orElseThrow();
    }

    private static boolean sameContent(ContactState a, ContactState b) {
        return Objects.equals(a.firstName(), b.firstName())
                && Objects.equals(a.lastName(), b.lastName())
                && Objects.equals(a.address(), b.address())
                && Objects.equals(a.email(), b.email())
                && Objects.equals(a.phone(), b.phone())
                && a.attributes().equals(b.attributes())
                && a.tags().equals(b.tags());
    }

    private static String name(ContactState state) {
        if (state.firstName() == null) {
            return state.lastName();
        }
        return state.lastName() == null ? state.firstName() : state.firstName() + " " + state.lastName();
    }
}
