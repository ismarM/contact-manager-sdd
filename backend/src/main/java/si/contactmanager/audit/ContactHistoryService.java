package si.contactmanager.audit;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import si.contactmanager.audit.ContactHistoryRepository.Latest;
import si.contactmanager.audit.ContactHistoryRepository.Live;
import si.contactmanager.audit.HistoryViews.Compare;
import si.contactmanager.audit.HistoryViews.ContactInfo;
import si.contactmanager.audit.HistoryViews.Duplicate;
import si.contactmanager.audit.HistoryViews.History;
import si.contactmanager.audit.HistoryViews.RestorePreview;
import si.contactmanager.audit.HistoryViews.StateView;
import si.contactmanager.audit.HistoryViews.Status;
import si.contactmanager.audit.HistoryViews.Version;
import si.contactmanager.audit.HistoryViews.Violation;
import si.contactmanager.contact.ContactSnapshots;
import si.contactmanager.contact.ContactState;
import si.contactmanager.contact.DuplicateLookup;
import si.contactmanager.contact.RestoreRules;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Zgodovina, različice, primerjava in predogled obnove (015, research R-01, R-02, R-08). Vse je izpeljano iz sledi 005;
 * dostop do skupine preveri {@code GroupAccess} pred klicem, kontakt mora biti živ ali znan sledi te skupine (sicer 404).
 */
@Service
class ContactHistoryService {

    private final ContactHistoryRepository repository;
    private final ContactSnapshots snapshots;
    private final DuplicateLookup duplicates;
    private final RestoreRules rules;

    ContactHistoryService(
            ContactHistoryRepository repository,
            ContactSnapshots snapshots,
            DuplicateLookup duplicates,
            RestoreRules rules) {
        this.rules = rules;
        this.repository = repository;
        this.snapshots = snapshots;
        this.duplicates = duplicates;
    }

    /** Kontakt te skupine (živ ali v sledi); sicer 404. */
    Known known(Membership membership, UUID contact) {
        UUID group = membership.groupId();
        Optional<Live> live = repository.live(group, contact);
        Optional<Latest> latest = repository.latest(group, contact);
        if (live.isEmpty() && latest.isEmpty()) {
            throw new NotFoundException();
        }
        return new Known(live, latest, ContactHistoryRepository.status(live, latest));
    }

    record Known(Optional<Live> live, Optional<Latest> latest, Status status) {

        String displayName() {
            return live.map(Live::displayName)
                    .orElseGet(() -> latest.map(Latest::displayName).orElse(null));
        }
    }

    History history(Membership membership, UUID contact, int page, int size) {
        Known known = known(membership, contact);
        UUID group = membership.groupId();
        ContactInfo info = new ContactInfo(
                contact,
                known.displayName(),
                known.status(),
                known.live().map(Live::version).orElse(null),
                known.latest().map(Latest::entryId).orElse(null),
                repository.hasInitial(group, contact));
        return new History(
                info, repository.count(group, contact), page, size, repository.page(group, contact, size, page));
    }

    /** Različica kontakta: {@code ref} je id vnosa, {@code initial} ali (samo za živ kontakt) {@code current}. */
    Version version(Membership membership, UUID contact, String ref) {
        UUID group = membership.groupId();
        known(membership, contact);
        return resolve(group, contact, ref, true);
    }

    Version resolve(UUID group, UUID contact, String ref, boolean allowCurrent) {
        if ("current".equals(ref) && allowCurrent) {
            ContactState state = snapshots.snapshot(group, contact);
            if (state == null) {
                throw new NotFoundException();
            }
            return new Version(
                    "current", state.updatedAt(), repository.userRef(state.updatedById()), null, StateView.of(state));
        }
        if ("initial".equals(ref)) {
            return repository.initial(group, contact).orElseThrow(NotFoundException::new);
        }
        UUID entry;
        try {
            entry = UUID.fromString(ref);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
        return repository.byEntry(group, contact, entry).orElseThrow(NotFoundException::new);
    }

    Compare compare(Membership membership, UUID contact, String from, String to) {
        UUID group = membership.groupId();
        known(membership, contact);
        Version a = resolve(group, contact, from, true);
        Version b = resolve(group, contact, to, true);
        if (a.ref().equals(b.ref())) {
            throw new ValidationException(List.of(new FieldError("to", "INVALID_VALUE")));
        }
        return new Compare(a, b, ChangeDiff.fields(state(a), state(b)));
    }

    RestorePreview preview(Membership membership, UUID contact, String from) {
        UUID group = membership.groupId();
        Known known = known(membership, contact);
        Version target = resolve(group, contact, from, false);
        ContactState now = snapshots.snapshot(group, contact);
        ContactState goal = state(target);
        List<Violation> violations = List.of();
        try {
            goal = rules.conform(
                    group, repository.fullState(group, contact, from).orElseThrow(NotFoundException::new), now, false);
        } catch (ValidationException e) {
            violations = e.errors().stream()
                    .map(f -> new Violation(f.field(), f.code()))
                    .toList();
        }
        boolean merged = known.status() == Status.MERGED;
        boolean invalid = !violations.isEmpty();
        boolean same = !invalid && now != null && RollbackService.sameContent(now, goal);
        List<Duplicate> found = now != null
                ? List.of()
                : duplicates.find(group, goal, contact).stream()
                        .map(m -> new Duplicate(
                                m.contactId(), m.displayName(), m.reason().name()))
                        .toList();
        return new RestorePreview(
                target,
                ChangeDiff.fields(now, goal),
                known.status(),
                !merged && !same && !invalid,
                merged ? "MERGED" : invalid ? "INVALID_STATE" : same ? "NO_CHANGES" : null,
                known.live().map(Live::version).orElse(null),
                known.latest().map(Latest::entryId).orElse(null),
                found,
                violations);
    }

    /** Vsebina različice kot {@link ContactState} (metapodatki so nepomembni za razlike). */
    static ContactState state(Version version) {
        StateView s = version.state();
        return new ContactState(
                s.firstName(),
                s.lastName(),
                s.address(),
                s.addressParts(),
                s.email(),
                s.phone(),
                s.company(),
                s.country(),
                s.attributes(),
                s.tags(),
                s.version(),
                java.time.Instant.EPOCH,
                java.time.Instant.EPOCH,
                null);
    }
}
