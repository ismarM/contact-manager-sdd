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
    private final TypedAttributes typed;

    RestoreRules(CanonicalForms canonical, TypedAttributes typed) {
        this.canonical = canonical;
        this.typed = typed;
    }

    /**
     * Ciljno stanje po današnjih pravilih ({@code current == null}: kontakt je izbrisan); {@link ValidationException}
     * (po polju: {@code country}, {@code company}, {@code attributes[i].key}), če stanje ni več veljavno.
     */
    public ContactState conform(UUID group, ContactState goal, ContactState current) {
        return conform(group, goal, current, true);
    }

    /**
     * Kot {@link #conform(UUID, ContactState, ContactState)}; {@code write == false} (predogled) tipov ključev ne
     * zapiše: prost ključ ostane brez vrstice. Vrednosti atributov morajo biti veljavne za <b>trenutni</b> tip ključa
     * v skupini (016, FR-016-26), sicer napaka {@code attributes[i].value}; prost ključ prevzame tip iz posnetka.
     */
    public ContactState conform(UUID group, ContactState goal, ContactState current, boolean write) {
        List<FieldError> errors = new ArrayList<>();
        if (goal.country() != null && !CountryNames.isValid(goal.country())) {
            errors.add(new FieldError("country", "INVALID_VALUE"));
        }
        if (goal.company() != null && goal.company().length() > ContactInputParser.COMPANY_MAX) {
            errors.add(new FieldError("company", "TOO_LONG"));
        }
        Set<String> held = current == null ? Set.of() : AttributeKeys.normalizedKeys(current.attributes());
        errors.addAll(AttributeKeys.reservedErrors(goal.attributes(), held));
        List<Attribute> typedAttributes = typedAttributes(group, goal, errors, write);
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
                goal.addressParts(),
                goal.email(),
                goal.phone(),
                goal.company(),
                goal.country(),
                canonical.attributes(group, typedAttributes, storedKeys),
                canonical.tags(group, goal.tags(), storedTags),
                goal.version(),
                goal.createdAt(),
                goal.updatedAt(),
                goal.updatedById());
    }

    private List<Attribute> typedAttributes(UUID group, ContactState goal, List<FieldError> errors, boolean write) {
        List<Attribute> result = new ArrayList<>(goal.attributes().size());
        for (int i = 0; i < goal.attributes().size(); i++) {
            Attribute recorded = goal.attributes().get(i);
            AttributeType current =
                    typed.effective(group, ContactInputParser.normalize(recorded.key()), recorded.type(), write);
            if (current == recorded.type()) {
                result.add(recorded);
                continue;
            }
            String text = recorded.parts() != null ? AddressFormats.text(recorded.parts()) : recorded.value();
            TypedValues.Result normalized = TypedValues.normalize(current, text, goal.country());
            if (normalized.valid()) {
                result.add(new Attribute(recorded.key(), current, normalized.value(), null));
            } else {
                errors.add(new FieldError("attributes[" + i + "].value", normalized.error()));
                result.add(recorded);
            }
        }
        return result;
    }
}
