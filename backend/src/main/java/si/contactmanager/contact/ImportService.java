package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.audit.AuditAction;
import si.contactmanager.audit.AuditLog;
import si.contactmanager.audit.ContactChange;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Predogled in potrditev uvoza (FR-014-03 … -09; research R-04). Predogled ne spreminja ničesar; potrditev znova preveri
 * vse (pravila 004/013, država samo kot koda, rezervirana imena, meje – to opravi {@link ImportInputParser}) in pod
 * zaklepom skupine atomarno ustvari kontakte z enim vnosom sledi {@code IMPORT}.
 */
@Service
class ImportService {

    /** Rezultat preverjanja ene vrstice predogleda (contracts/openapi.yaml – PreviewRow). */
    record PreviewRow(
            int index, List<FieldError> errors, Country country, Duplicate duplicate, Normalized normalized) {}

    record Country(String status, String code, List<String> candidates) {}

    record Duplicate(String reason, String contactName, Integer inFileIndex) {}

    record Normalized(List<String> attributeKeys, List<String> tags) {}

    record Preview(List<PreviewRow> rows) {}

    record Created(int created, UUID auditEntryId) {}

    private final ContactRepository contacts;
    private final ContactSnapshots snapshots;
    private final CanonicalForms canonical;
    private final AuditLog audit;
    private final ContactInputParser parser = new ContactInputParser();

    ImportService(ContactRepository contacts, ContactSnapshots snapshots, CanonicalForms canonical, AuditLog audit) {
        this.contacts = contacts;
        this.snapshots = snapshots;
        this.canonical = canonical;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    Preview preview(Membership membership, List<JsonNode> candidates) {
        Map<String, Country> countries = new HashMap<>();
        Map<String, Map<String, String>> existing = existingKeys(membership.groupId());
        Map<String, Map<String, Integer>> inFile = new HashMap<>();
        List<ContactInput> valid = new ArrayList<>();
        List<Integer> validIndex = new ArrayList<>();
        List<PreviewRow> rows = new ArrayList<>(candidates.size());
        for (int i = 0; i < candidates.size(); i++) {
            JsonNode node = candidates.get(i);
            String countryText = node.isObject()
                            && node.get("countryText") != null
                            && node.get("countryText").isString()
                    ? node.get("countryText").asString()
                    : null;
            ObjectNode contact = node.isObject() ? ((ObjectNode) node).deepCopy() : null;
            if (contact != null) {
                contact.remove("countryText");
            }
            ContactInputParser.Parsed parsed = parser.parseNode(contact, false);
            List<FieldError> errors = new ArrayList<>(parsed.errors());
            if (parsed.valid()) {
                errors.addAll(AttributeKeys.reservedErrors(parsed.input().attributes(), java.util.Set.of()));
            }
            Country country =
                    countries.computeIfAbsent(countryText == null ? "" : countryText.strip(), ImportService::country);
            Duplicate duplicate = null;
            if (errors.isEmpty()) {
                duplicate = duplicate(parsed.input(), existing, inFile, i);
                valid.add(parsed.input());
                validIndex.add(i);
            }
            rows.add(new PreviewRow(i, List.copyOf(errors), country, duplicate, null));
        }
        List<ContactInput> normalized = canonical.inputs(membership.groupId(), valid);
        for (int v = 0; v < normalized.size(); v++) {
            int i = validIndex.get(v);
            PreviewRow row = rows.get(i);
            ContactInput input = normalized.get(v);
            rows.set(
                    i,
                    new PreviewRow(
                            row.index(),
                            row.errors(),
                            row.country(),
                            row.duplicate(),
                            new Normalized(
                                    input.attributes().stream()
                                            .map(Attribute::key)
                                            .toList(),
                                    input.tags())));
        }
        return new Preview(List.copyOf(rows));
    }

    /** Potrditev: vhod je že v celoti preverjen ({@link ImportInputParser}); tu še arhiv pod zaklepom in kanonizacija. */
    @Transactional
    Created commit(Membership membership, List<ContactInput> inputs) {
        boolean archived = contacts.lockGroupArchived(membership.groupId()).orElseThrow(NotFoundException::new);
        if (archived) {
            throw new GroupArchivedException();
        }
        List<ContactInput> normalized = canonical.inputs(membership.groupId(), inputs);
        List<UUID> ids = snapshots.insertNew(membership.groupId(), membership.userId(), normalized);
        Map<UUID, ContactState> states = snapshots.load(membership.groupId(), ids);
        List<ContactChange> changes = new ArrayList<>(ids.size());
        for (UUID id : ids) {
            ContactState state = states.get(id);
            changes.add(new ContactChange(
                    id, ContactRepository.displayName(state.firstName(), state.lastName()), null, state));
        }
        UUID entry = audit.record(membership.groupId(), membership.userId(), AuditAction.IMPORT, changes);
        return new Created(ids.size(), entry);
    }

    private static Country country(String text) {
        if (text.isEmpty()) {
            return new Country("EMPTY", null, List.of());
        }
        return switch (CountryNames.resolve(text)) {
            case CountryNames.Resolution.Found found -> new Country("FOUND", found.code(), List.of());
            case CountryNames.Resolution.Ambiguous ambiguous -> new Country("AMBIGUOUS", null, ambiguous.candidates());
            case CountryNames.Resolution.Unknown unknown -> new Country("UNKNOWN", null, List.of());
        };
    }

    private static final List<String> CATEGORIES = List.of("email", "phone", "name");

    /** Ključi dvojnikov 011 obstoječih kontaktov skupine: kategorija → ključ → prikazno ime prvega kontakta. */
    private Map<String, Map<String, String>> existingKeys(UUID group) {
        Map<String, Map<String, String>> keys = new HashMap<>();
        for (DuplicateCandidate c : contacts.duplicateCandidates(group)) {
            for (String category : CATEGORIES) {
                Optional<String> key = DuplicateKeys.key(category, c.firstName(), c.lastName(), c.email(), c.phone());
                key.ifPresent(k -> keys.computeIfAbsent(category, x -> new HashMap<>())
                        .putIfAbsent(k, ContactRepository.displayName(c.firstName(), c.lastName())));
            }
        }
        return keys;
    }

    private static Duplicate duplicate(
            ContactInput input,
            Map<String, Map<String, String>> existing,
            Map<String, Map<String, Integer>> inFile,
            int index) {
        Duplicate found = null;
        for (String category : CATEGORIES) {
            Optional<String> key =
                    DuplicateKeys.key(category, input.firstName(), input.lastName(), input.email(), input.phone());
            if (key.isEmpty()) {
                continue;
            }
            String reason = category.toUpperCase(java.util.Locale.ROOT);
            String name = existing.getOrDefault(category, Map.of()).get(key.get());
            Integer earlier =
                    inFile.computeIfAbsent(category, x -> new HashMap<>()).putIfAbsent(key.get(), index);
            if (found == null && name != null) {
                found = new Duplicate(reason, name, null);
            } else if (found == null && earlier != null) {
                found = new Duplicate(reason, null, earlier);
            }
        }
        return found;
    }
}
