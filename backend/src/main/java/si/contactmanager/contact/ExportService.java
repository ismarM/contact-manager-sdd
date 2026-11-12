package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.contact.ContactQuery.Direction;
import si.contactmanager.contact.ExportRepository.Attribute;
import si.contactmanager.contact.ExportRepository.Contact;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.shared.error.ExportEmptyException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Priprava izvoza (010, FR-010-02 … FR-010-14): ena transakcija samo za branje, {@code REPEATABLE READ}, brez
 * zaklepov in brez pisanja (FR-010-14), zato vsi deli datoteke izvirajo iz istega stanja baze.
 */
@Service
class ExportService {

    /** Največ stolpcev lista (Excel); šest je predefiniranih (pet atributov kontakta in značke). */
    static final int MAX_COLUMNS = 16_384;

    private static final int FIXED_COLUMNS = 6;

    private final ExportRepository repository;

    ExportService(ExportRepository repository) {
        this.repository = repository;
    }

    /** Pripravljena vsebina datoteke in število izpuščenih (izbrisanih ali združenih) kontaktov. */
    record Prepared(String language, List<ExportWriter.Column> columns, List<ExportRow> rows, int skipped) {}

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Prepared prepare(Membership membership, ExportRequest request) {
        ContactQuery order = new ContactQuery(
                List.of(),
                List.of(),
                List.of(),
                request.sort(),
                request.dir() == null ? Direction.ASC : request.dir(),
                0,
                1);
        List<Contact> contacts = repository.rows(membership.groupId(), request.contactIds(), order);
        if (contacts.isEmpty()) {
            throw new ExportEmptyException();
        }
        int skipped = request.contactIds().size() - contacts.size();
        List<UUID> ids = contacts.stream().map(Contact::id).toList();

        List<String> keyOrder = repository.keyOrder(ids);
        if (FIXED_COLUMNS + keyOrder.size() > MAX_COLUMNS) {
            throw new ValidationException(List.of(new FieldError("contactIds", "TOO_MANY_COLUMNS")));
        }
        Map<UUID, List<Attribute>> byContact = new HashMap<>();
        for (Attribute attribute : repository.attributes(ids)) {
            byContact
                    .computeIfAbsent(attribute.contactId(), k -> new ArrayList<>())
                    .add(attribute);
        }
        Map<UUID, List<String>> tags = repository.tags(ids);
        // Glava stolpca je zapis ključa iz prve vrstice datoteke, ki ta ključ ima (vrstice so v vrstnem redu seznama).
        Map<String, String> headers = new HashMap<>();
        List<ExportRow> rows = new ArrayList<>();
        for (Contact contact : contacts) {
            Map<String, String> attributes = new HashMap<>();
            for (Attribute attribute : byContact.getOrDefault(contact.id(), List.of())) {
                attributes.putIfAbsent(attribute.keyNorm(), attribute.value());
                headers.putIfAbsent(attribute.keyNorm(), attribute.key());
            }
            rows.add(new ExportRow(
                    contact.id(),
                    contact.firstName(),
                    contact.lastName(),
                    contact.address(),
                    contact.email(),
                    contact.phone(),
                    attributes,
                    tags.getOrDefault(contact.id(), List.of())));
        }
        List<ExportWriter.Column> columns = keyOrder.stream()
                .map(key -> new ExportWriter.Column(key, headers.getOrDefault(key, key)))
                .toList();
        return new Prepared(request.language(), columns, rows, skipped);
    }
}
