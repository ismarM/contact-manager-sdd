package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Trenutno veljavna pravila 013 za stanje, ki ga obnova zapiše (015, research R-11): država samo uradna koda ISO,
 * podjetje do 200 znakov, nova rezervirana imena atributov niso dovoljena (zapis, ki ga kontakt že ima, ostane) in ključi
 * ter značke dobijo kanonični zapis skupine. Zgodovina ostane dobesedna; pravila veljajo samo za novo stanje.
 */
@Component
public class RestoreRules {

    private final CanonicalForms canonical;

    RestoreRules(CanonicalForms canonical) {
        this.canonical = canonical;
    }

    /**
     * Ciljno stanje po današnjih pravilih ({@code current == null}: kontakt je izbrisan); {@link ValidationException}
     * (po polju: {@code country}, {@code company}, {@code attributes[i].key}), če stanje ni več veljavno.
     */
    public ContactState conform(UUID group, ContactState goal, ContactState current) {
        List<FieldError> errors = new ArrayList<>();
        if (goal.country() != null && !CountryNames.isValid(goal.country())) {
            errors.add(new FieldError("country", "INVALID_VALUE"));
        }
        if (goal.company() != null && goal.company().length() > ContactInputParser.COMPANY_MAX) {
            errors.add(new FieldError("company", "TOO_LONG"));
        }
        Set<String> held = current == null ? Set.of() : AttributeKeys.normalizedKeys(current.attributes());
        errors.addAll(AttributeKeys.reservedErrors(goal.attributes(), held));
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        List<String> storedKeys = current == null
                ? List.of()
                : current.attributes().stream().map(Attribute::key).toList();
        List<String> storedTags = current == null ? List.of() : current.tags();
        return new ContactState(
                goal.firstName(),
                goal.lastName(),
                goal.address(),
                goal.email(),
                goal.phone(),
                goal.company(),
                goal.country(),
                canonical.attributes(group, goal.attributes(), storedKeys),
                canonical.tags(group, goal.tags(), storedTags),
                goal.version(),
                goal.createdAt(),
                goal.updatedAt(),
                goal.updatedById());
    }
}
