package si.contactmanager.contact;

import java.time.Instant;
import java.util.List;

/**
 * Celotno stanje kontakta v vnosu revizijske sledi (data-model.md – ContactState). Vsebina: polja, atributi in značke
 * v vrstnem redu vnosa; metapodatki ({@code version}, {@code createdAt}, {@code updatedAt}, {@code updatedById}) se ob
 * rollbacku obnovijo, ne štejejo pa kot sprememba. {@code updatedById == null}: izvajalec je izbrisal račun.
 */
public record ContactState(
        String firstName,
        String lastName,
        String address,
        String email,
        String phone,
        String company,
        String country,
        List<Attribute> attributes,
        List<String> tags,
        long version,
        Instant createdAt,
        Instant updatedAt,
        Long updatedById) {

    /** Stanje brez polj podjetje in država (posnetki pred 013, FR-013-02): obe polji sta prazni. */
    public ContactState(
            String firstName,
            String lastName,
            String address,
            String email,
            String phone,
            List<Attribute> attributes,
            List<String> tags,
            long version,
            Instant createdAt,
            Instant updatedAt,
            Long updatedById) {
        this(
                firstName,
                lastName,
                address,
                email,
                phone,
                null,
                null,
                attributes,
                tags,
                version,
                createdAt,
                updatedAt,
                updatedById);
    }
}
