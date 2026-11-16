package si.contactmanager.contact;

import java.util.List;

/**
 * Kontakt, prebran iz datoteke ali vizitke, pred preverjanjem (014 data-model.md – ImportCandidate): nizi brez
 * obrezovanja (to opravi {@link ContactInputParser}), {@code countryText} je besedilo ali koda iz datoteke; {@code addressParts} (016) so deli naslova iz vizitke ali stolpcev,
 * atributi nosijo tip ključa.
 */
public record ImportCandidate(
        String firstName,
        String lastName,
        String address,
        Address addressParts,
        String email,
        String phone,
        String company,
        String countryText,
        List<Attribute> attributes,
        List<String> tags) {

    public ImportCandidate {
        attributes = List.copyOf(attributes);
        tags = List.copyOf(tags);
    }
}
