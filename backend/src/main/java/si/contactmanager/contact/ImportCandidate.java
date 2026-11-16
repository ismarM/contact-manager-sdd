package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

/**
 * Kontakt, prebran iz datoteke ali vizitke, pred preverjanjem (014 data-model.md – ImportCandidate): nizi brez
 * obrezovanja (to opravi {@link ContactInputParser}), {@code countryText} je besedilo ali koda iz datoteke.
 */
public record ImportCandidate(
        String firstName,
        String lastName,
        String address,
        String email,
        String phone,
        String company,
        String countryText,
        // 016: kandidat iz datoteke še ne nosi tipov (preslikava tipov v uvozu je v zgodbi US6); v JSON ostane brez
        // njih.
        @JsonIgnoreProperties({"type", "parts"}) List<Attribute> attributes,
        List<String> tags) {

    public ImportCandidate {
        attributes = List.copyOf(attributes);
        tags = List.copyOf(tags);
    }
}
