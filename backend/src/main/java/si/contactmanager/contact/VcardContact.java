package si.contactmanager.contact;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Kontakt za zapis vizitke (014 research R-03). {@code id} in {@code updatedAt} sta {@code null}, kadar vizitka ne
 * potrebuje {@code UID} in {@code REV} (npr. testni vzorci); {@code country} je koda ISO ali {@code null}.
 */
public record VcardContact(
        UUID id,
        Instant updatedAt,
        String firstName,
        String lastName,
        String address,
        Address addressParts,
        String email,
        String phone,
        String company,
        String country,
        List<Attribute> attributes,
        List<String> tags) {

    public VcardContact {
        attributes = List.copyOf(attributes);
        tags = List.copyOf(tags);
    }

    static VcardContact of(ContactDetail detail) {
        return new VcardContact(
                detail.id(),
                detail.updatedAt(),
                detail.firstName(),
                detail.lastName(),
                detail.address(),
                detail.addressParts(),
                detail.email(),
                detail.phone(),
                detail.company(),
                detail.country(),
                detail.attributes(),
                detail.tags());
    }
}
