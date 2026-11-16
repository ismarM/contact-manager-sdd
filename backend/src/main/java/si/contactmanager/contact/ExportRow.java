package si.contactmanager.contact;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Vrstica izvoza: kontakt, vrednosti atributov po {@code key_norm} in značke po slovenski abecedi (010, data-model.md). */
record ExportRow(
        UUID id,
        String firstName,
        String lastName,
        String address,
        Address addressParts,
        String email,
        String phone,
        String country,
        String company,
        Map<String, String> attributes,
        List<String> tags) {
    /** Stanje brez razčlenjenega naslova (pred 016): {@code addressParts} je {@code null}. */
    public ExportRow(
            UUID id,
            String firstName,
            String lastName,
            String address,
            String email,
            String phone,
            String country,
            String company,
            Map<String, String> attributes,
            List<String> tags) {
        this(id, firstName, lastName, address, null, email, phone, country, company, attributes, tags);
    }
}
