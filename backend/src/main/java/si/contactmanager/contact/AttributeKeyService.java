package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.AuditLog;
import si.contactmanager.audit.ContactChange;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.AttributeTypeConflictException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.VersionConflictException;

/**
 * Ključi atributov skupine in sprememba njihovega tipa (016, FR-016-04, -05, -26). Dostop do skupine in vlogo preveri
 * {@link AttributeKeyController}; sprememba tipa je ena transakcija: zaklep skupine (R-05), zaklep vrstice ključa
 * {@code FOR UPDATE} (počaka na urejanja kontaktov, ki drže {@code FOR SHARE}), preverjanje in normalizacija vseh
 * vrednosti, nova verzija kontaktov in en vnos sledi {@code ATTRIBUTE_TYPE}.
 */
@Service
class AttributeKeyService {

    /** Največ kontaktov v telesu {@code ATTRIBUTE_TYPE_CONFLICT} (FR-016-05). */
    static final int CONFLICT_MAX = 100;

    private final AttributeKeyRepository keys;
    private final ContactRepository contacts;
    private final ContactSnapshots snapshots;
    private final AuditLog audit;

    AttributeKeyService(
            AttributeKeyRepository keys, ContactRepository contacts, ContactSnapshots snapshots, AuditLog audit) {
        this.keys = keys;
        this.contacts = contacts;
        this.snapshots = snapshots;
        this.audit = audit;
    }

    /** Stran ključev v uporabi (samo branje). */
    AttributeKeyPage list(Membership membership, String q, int page, int size) {
        List<AttributeKeyView> items = keys.list(membership.groupId(), q, page, size).stream()
                .map(k -> new AttributeKeyView(k.key(), k.type(), k.contactCount(), k.version()))
                .toList();
        return new AttributeKeyPage(items, page, size, keys.listCount(membership.groupId(), q));
    }

    /**
     * Atomarna sprememba tipa ključa. Enak tip kot trenutni: brez spremembe in brez vnosa sledi. Vrednost, ki je novi
     * tip ne sprejme: {@code 409 ATTRIBUTE_TYPE_CONFLICT}, nič se ne spremeni.
     */
    @Transactional
    AttributeKeyView changeType(Membership membership, String key, AttributeType type, long version) {
        UUID group = membership.groupId();
        boolean archived = contacts.lockGroupArchived(group).orElseThrow(NotFoundException::new);
        if (archived) {
            throw new GroupArchivedException();
        }
        String norm = ContactInputParser.normalize(key);
        if (keys.isFree(group, norm)) {
            throw new NotFoundException();
        }
        keys.register(group, norm);
        AttributeKeyRepository.Row row = keys.lockForUpdate(group, norm).orElseThrow(NotFoundException::new);
        if (version != row.version()) {
            throw new VersionConflictException(view(group, norm, row.type(), row.version()));
        }
        if (row.type() == type) {
            return view(group, norm, row.type(), row.version());
        }
        List<AttributeKeyRepository.Value> values = keys.values(group, norm);
        Map<UUID, String> converted = new LinkedHashMap<>();
        List<TypeConflict.Item> conflicts = new ArrayList<>();
        long invalid = 0;
        for (AttributeKeyRepository.Value value : values) {
            TypedValues.Result result = TypedValues.normalize(type, value.value(), value.country());
            if (result.valid()) {
                converted.put(value.contactId(), result.value());
            } else {
                invalid++;
                if (conflicts.size() < CONFLICT_MAX) {
                    conflicts.add(new TypeConflict.Item(
                            value.contactId(),
                            ContactRepository.displayName(value.firstName(), value.lastName()),
                            value.value()));
                }
            }
        }
        if (invalid > 0) {
            throw new AttributeTypeConflictException(new TypeConflict(List.copyOf(conflicts), invalid));
        }
        List<UUID> ids =
                values.stream().map(AttributeKeyRepository.Value::contactId).toList();
        contacts.lockExisting(group, ids);
        Map<UUID, ContactState> before = snapshots.load(group, ids);
        for (AttributeKeyRepository.Value value : values) {
            String normalized = converted.get(value.contactId());
            if (!normalized.equals(value.value())) {
                keys.updateValue(value.contactId(), norm, normalized);
            }
        }
        long newVersion = keys.setType(group, norm, type);
        keys.touch(group, ids, membership.userId());
        Map<UUID, ContactState> after = snapshots.load(group, ids);
        List<ContactChange> changes = new ArrayList<>(ids.size());
        for (UUID id : ids) {
            ContactState state = after.get(id);
            changes.add(new ContactChange(
                    id, ContactRepository.displayName(state.firstName(), state.lastName()), before.get(id), state));
        }
        String spelling = contacts.canonicalKeys(group, List.of(norm)).getOrDefault(norm, key);
        audit.recordAttributeType(
                group, membership.userId(), spelling, row.type().name(), type.name(), changes);
        return new AttributeKeyView(spelling, type, ids.size(), newVersion);
    }

    private AttributeKeyView view(UUID group, String norm, AttributeType type, long version) {
        String spelling = contacts.canonicalKeys(group, List.of(norm)).getOrDefault(norm, norm);
        return new AttributeKeyView(spelling, type, keys.contactCount(group, norm), version);
    }
}
