package si.contactmanager.audit;

import java.util.UUID;
import org.springframework.stereotype.Service;
import si.contactmanager.audit.AuditRepository.Filter;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.NotFoundException;

/** Branje revizijske sledi (plan.md – REST endpoints): dostop do skupine preveri {@code GroupAccess} pred klicem. */
@Service
class AuditService {

    private final AuditRepository repository;

    AuditService(AuditRepository repository) {
        this.repository = repository;
    }

    AuditPage list(Membership membership, Filter filter, int page, int size) {
        UUID group = membership.groupId();
        AuditPage.ContactFilter contact = filter.contact() == null
                ? null
                : new AuditPage.ContactFilter(
                        filter.contact(),
                        repository.latestDisplayName(group, filter.contact()).orElse(null));
        return new AuditPage(
                repository.count(group, filter),
                page,
                size,
                repository.page(group, filter, size, page),
                repository.latestEntryId(group).orElse(null),
                contact);
    }

    AuditEntry entry(Membership membership, UUID id) {
        return repository.find(membership.groupId(), id).orElseThrow(NotFoundException::new);
    }

    ChangePage changes(Membership membership, UUID id, int page, int size) {
        entry(membership, id);
        return new ChangePage(repository.countChanges(id), page, size, repository.changes(id, size, page));
    }
}
