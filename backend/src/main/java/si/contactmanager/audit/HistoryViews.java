package si.contactmanager.audit;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import si.contactmanager.contact.Address;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.ContactState;
import si.contactmanager.group.UserRef;

/** Odgovori zgodovine, različic, primerjave, predogleda obnove in seznama izbrisanih kontaktov (015, contracts/openapi.yaml). */
final class HistoryViews {

    private HistoryViews() {}

    /** Stanje kontakta: živ, izbrisan (odstranjevanje, rollback skupine) ali odstranjen z združevanjem. */
    enum Status {
        ACTIVE,
        DELETED,
        MERGED
    }

    record MergedInto(UUID contactId, String displayName) {}

    /** Dogodek zgodovine = ena sprememba kontakta v vnosu; {@code action} je besedilo (neznana vrsta je veljavna). */
    record HistoryEvent(
            UUID entryId,
            Instant createdAt,
            UserRef actor,
            String action,
            ContactChangeView.Kind kind,
            int entryContactCount,
            String displayName,
            List<ChangeField> fields,
            boolean hasVersion,
            AuditEntry.Target target,
            boolean targetInitial,
            MergedInto mergedInto) {}

    record ContactInfo(
            UUID id, String displayName, Status status, Long version, UUID lastEntryId, boolean hasInitial) {}

    record History(ContactInfo contact, long total, int page, int size, List<HistoryEvent> items) {}

    /** Vsebina različice (brez metapodatkov razen verzije). */
    record StateView(
            String firstName,
            String lastName,
            String address,
            @JsonInclude(JsonInclude.Include.NON_NULL) Address addressParts,
            String email,
            String phone,
            String company,
            String country,
            List<Attribute> attributes,
            List<String> tags,
            long version) {

        static StateView of(ContactState s) {
            return new StateView(
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
                    s.version());
        }
    }

    /** {@code ref}: id vnosa, {@code initial} ali {@code current}; {@code createdAt == null} za {@code initial}. */
    record Version(String ref, Instant createdAt, UserRef actor, String action, StateView state) {}

    record Compare(Version from, Version to, List<ChangeField> changes) {}

    record Duplicate(UUID contactId, String displayName, String reason) {}

    /** Kršitev trenutnih pravil v ciljnem stanju obnove (polje in koda kot pri {@code 400}). */
    record Violation(String field, String code) {}

    record RestorePreview(
            Version target,
            List<ChangeField> changes,
            Status status,
            boolean restorable,
            String reason,
            Long currentVersion,
            UUID lastEntryId,
            List<Duplicate> duplicates,
            List<Violation> violations) {}

    record DeletedItem(
            UUID contactId,
            String displayName,
            String email,
            String company,
            Instant removedAt,
            UserRef removedBy,
            UUID entryId,
            String reason,
            boolean restorable,
            DeletedMergedInto mergedInto) {}

    record DeletedMergedInto(UUID contactId, String displayName, boolean exists) {}

    record DeletedPage(long total, int page, int size, List<DeletedItem> items) {}
}
