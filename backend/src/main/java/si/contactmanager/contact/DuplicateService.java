package si.contactmanager.contact;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.AuditAction;
import si.contactmanager.audit.AuditLog;
import si.contactmanager.audit.ContactChange;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.image.ImageStore;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Iskanje, primerjava in združitev dvojnikov (plan.md – REST endpoints; research R-02, R-05, R-08, R-09). Skupine
 * dvojnikov se izračunajo ob vsakem iskanju in niso shranjene; združitev je ena transakcija z enim vnosom {@code MERGE}.
 */
@Service
class DuplicateService {

    /** Ohranjeni kontakt je najstarejši po času ustvaritve, nato po id (FR-011-11). */
    private static final Comparator<ContactState> OLDEST_FIRST = Comparator.comparing(ContactState::createdAt);

    private final ContactRepository contacts;
    private final ImageStore images;
    private final ContactSnapshots snapshots;
    private final AuditLog audit;
    private final CanonicalForms canonical;
    private final TypedAttributes typed;
    private final MergeInputParser parser = new MergeInputParser();

    DuplicateService(
            ContactRepository contacts,
            ImageStore images,
            ContactSnapshots snapshots,
            AuditLog audit,
            CanonicalForms canonical,
            TypedAttributes typed) {
        this.typed = typed;
        this.canonical = canonical;
        this.images = images;
        this.contacts = contacts;
        this.snapshots = snapshots;
        this.audit = audit;
    }

    /** Skupine dvojnikov po kategoriji med vsemi kontakti skupine (FR-011-02 … FR-011-07). */
    DuplicatePage search(Membership membership, String category, int page, int size) {
        DuplicatePage found =
                DuplicateGroups.build(category, contacts.duplicateCandidates(membership.groupId()), page, size);
        List<UUID> shown = found.groups().stream()
                .flatMap(group -> group.contacts().stream())
                .map(DuplicateContact::id)
                .toList();
        Map<UUID, Long> revisions = images.contactRevisions(membership.groupId(), shown);
        if (revisions.isEmpty()) {
            return found;
        }
        // Slike (018): revizija se doda samo kontaktom strani, ki se vrne (FR-018-09).
        return new DuplicatePage(
                found.category(),
                found.total(),
                found.page(),
                found.size(),
                found.groups().stream()
                        .map(group -> new DuplicateGroup(
                                group.reason(),
                                group.size(),
                                group.contacts().stream()
                                        .map(c -> new DuplicateContact(c.id(), c.displayName(), revisions.get(c.id())))
                                        .toList()))
                        .toList());
    }

    /**
     * Korak 404 (research R-05): vsaka identiteta je kontakt te skupine ali je v njeni sledi (bil je); sicer {@code 404}
     * brez razkritja obstoja, nič se ne spremeni.
     */
    void requireKnown(Membership membership, Set<UUID> ids) {
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

    /** Trenutni podatki in verzije obstoječih kontaktov, razvrščeni po {@code created_at}, {@code id} (FR-011-08). */
    Comparison compare(Membership membership, List<UUID> ids) {
        Map<UUID, ContactState> states = snapshots.load(membership.groupId(), ids);
        Map<UUID, Long> revisions = images.contactRevisions(membership.groupId(), states.keySet());
        List<CompareContact> result = states.entrySet().stream()
                .sorted(Map.Entry.<UUID, ContactState>comparingByValue(OLDEST_FIRST)
                        .thenComparing(entry -> entry.getKey().toString()))
                .map(entry -> compareContact(entry.getKey(), entry.getValue(), revisions.get(entry.getKey())))
                .toList();
        return new Comparison(result);
    }

    /**
     * Atomarna združitev (FR-011-15 … FR-011-17, research R-08, R-09): zaklep skupine ({@code FOR SHARE}) in kontaktov
     * po {@code id}, preverjanje verzij (409), preverjanje rezultata po slovarju podatkov (400), posodobitev
     * najstarejšega kontakta, izbris ostalih in en vnos {@code MERGE}. Katera koli izjema razveljavi vse.
     */
    @Transactional
    MergeResult merge(Membership membership, List<MergeInput.Target> targets, String body) {
        UUID group = membership.groupId();
        if (contacts.lockGroupArchived(group).orElseThrow(NotFoundException::new)) {
            throw new GroupArchivedException();
        }
        List<UUID> ids = targets.stream().map(MergeInput.Target::id).toList();
        Set<UUID> locked = contacts.lockExisting(group, ids);
        Map<UUID, ContactState> before = snapshots.load(group, locked);
        for (MergeInput.Target target : targets) {
            ContactState state = before.get(target.id());
            // Izbrisan (znan iz sledi) ali spremenjen kontakt: zahtevek je zastarel (FR-011-16).
            if (!locked.contains(target.id()) || state == null || state.version() != target.version()) {
                throw new VersionConflictException(null);
            }
        }
        MergeInputParser.Parsed<ContactInput> parsed = parser.parseResult(body);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        // Rezervirana imena in kanonični zapis (FR-013-08, -10): dovoljeni so ključi in značke, ki jih že hrani kateri
        // koli
        // vključeni kontakt.
        List<String> storedKeys = new ArrayList<>();
        List<String> storedTags = new ArrayList<>();
        List<Attribute> storedAttributes = new ArrayList<>();
        for (ContactState state : before.values()) {
            storedAttributes.addAll(state.attributes());
            state.attributes().forEach(a -> storedKeys.add(a.key()));
            storedTags.addAll(state.tags());
        }
        List<si.contactmanager.shared.error.ValidationError.FieldError> reserved = AttributeKeys.reservedErrors(
                parsed.value().attributes(), AttributeKeys.normalizedKeys(storedAttributes));
        if (!reserved.isEmpty()) {
            throw new ValidationException(reserved.stream()
                    .map(e -> new si.contactmanager.shared.error.ValidationError.FieldError(
                            "result." + e.field(), e.code()))
                    .toList());
        }
        ContactInput result = canonical.input(group, parsed.value(), storedKeys, storedTags);
        // Vrednosti po tipu (016, FR-016-26): e-naslov, telefon in atributi; vrednosti, ki jih vključeni kontakti že
        // hranijo, ostanejo dobesedne (FR-016-09).
        ContactService.Predefined predefined = ContactService.normalizePredefined(
                result,
                before.values().stream().map(ContactState::email).toList(),
                before.values().stream().map(ContactState::phone).toList());
        List<si.contactmanager.shared.error.ValidationError.FieldError> typeErrors =
                new ArrayList<>(predefined.errors().stream()
                        .map(e -> new si.contactmanager.shared.error.ValidationError.FieldError(
                                "result." + e.field(), e.code()))
                        .toList());
        TypedAttributes.Resolution resolved = typed.resolve(
                group, predefined.input().attributes(), List.of(), storedAttributes, result.country(), true);
        resolved.errors()
                .forEach(e -> typeErrors.add(new si.contactmanager.shared.error.ValidationError.FieldError(
                        "result." + e.field(), e.code())));
        if (!typeErrors.isEmpty()) {
            throw new ValidationException(typeErrors);
        }
        result = predefined.input().withAttributes(resolved.attributes());

        List<UUID> ordered = new ArrayList<>(ids);
        ordered.sort(
                Comparator.comparing((UUID id) -> before.get(id).createdAt()).thenComparing(UUID::toString));
        UUID keeper = ordered.get(0);
        List<UUID> removed = ordered.subList(1, ordered.size());

        ContactState keeperBefore = before.get(keeper);
        snapshots.replaceMerged(group, membership.userId(), keeper, merged(keeperBefore, result));
        // Slike (018, FR-018-11): v isti transakciji, pred izbrisom poraženih (sprožilec jih sicer samo odklopi).
        images.mergeInto(group, keeper, removed);
        contacts.deleteAll(group, removed);
        ContactState keeperAfter = snapshots.snapshot(group, keeper);

        List<ContactChange> changes = new ArrayList<>();
        changes.add(new ContactChange(keeper, name(keeperAfter), keeperBefore, keeperAfter));
        for (UUID id : removed) {
            ContactState state = before.get(id);
            changes.add(new ContactChange(id, name(state), state, null));
        }
        UUID entry = audit.record(group, membership.userId(), AuditAction.MERGE, changes);
        return new MergeResult(keeper, name(keeperAfter), ordered.size(), entry);
    }

    /** Vrednosti iz {@code result}; metapodatke (id, čas ustvaritve) hrani ohranjeni kontakt, verzijo poveča zapis. */
    private static ContactState merged(ContactState keeperBefore, ContactInput result) {
        return new ContactState(
                result.firstName(),
                result.lastName(),
                result.address(),
                result.email(),
                result.phone(),
                result.company(),
                result.country(),
                result.attributes(),
                result.tags(),
                keeperBefore.version() + 1,
                keeperBefore.createdAt(),
                Instant.now(),
                null);
    }

    private static CompareContact compareContact(UUID id, ContactState state, Long photoRevision) {
        return new CompareContact(
                id,
                state.version(),
                state.createdAt(),
                state.firstName(),
                state.lastName(),
                state.address(),
                state.email(),
                state.phone(),
                state.company(),
                state.country(),
                state.attributes(),
                state.tags(),
                photoRevision);
    }

    private static String name(ContactState state) {
        String name = ContactRepository.displayName(state.firstName(), state.lastName());
        return name == null ? "" : name;
    }
}
