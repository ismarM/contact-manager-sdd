package si.contactmanager.contact;

import ezvcard.Ezvcard;
import ezvcard.VCard;
import ezvcard.VCardVersion;
import ezvcard.parameter.EmailType;
import ezvcard.parameter.TelephoneType;
import ezvcard.property.Birthday;
import ezvcard.property.Categories;
import ezvcard.property.Email;
import ezvcard.property.FormattedName;
import ezvcard.property.Note;
import ezvcard.property.Organization;
import ezvcard.property.RawProperty;
import ezvcard.property.Revision;
import ezvcard.property.StructuredName;
import ezvcard.property.Telephone;
import ezvcard.property.Uid;
import ezvcard.property.Url;
import ezvcard.property.VCardProperty;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Zapis kontaktov kot vizitk vCard 3.0 v UTF-8 (FR-014-11, research R-03): {@code N}, {@code FN}, {@code ORG},
 * {@code EMAIL}, {@code TEL}, {@code ADR} (naslov v ulici, ime države v jeziku in {@code X-CM-CC}), {@code CATEGORIES},
 * dodatni atributi kot pari {@code X-CM-KEY}/{@code X-CM-VALUE} v skupini {@code attrN}; {@code UID} in {@code REV}
 * samo, kadar sta znana. Tipi (016, FR-016-25): {@code ADR} po delih (ulica, dodatna vrstica, kraj, regija, poštna
 * številka; nerazčlenjen naslov v delu ulice), dodatni atributi tipov <i>Telefon</i>, <i>E-naslov</i>, <i>Naslov</i>,
 * <i>Spletni naslov</i>, <i>Datum</i> in <i>Opombe</i> kot {@code attrN.TEL|EMAIL|ADR|URL|BDAY|NOTE} z
 * {@code attrN.X-ABLabel} in {@code attrN.X-CM-KEY} (oznaka ključa); <i>Drugo</i> kot doslej. Vrednosti so kanonične.
 */
public final class VcardWriter {

    private VcardWriter() {}

    /** Vizitke v podanem vrstnem redu; {@code language} določa ime države v {@code ADR}. */
    public static String write(List<VcardContact> contacts, String language) {
        List<VCard> cards = new ArrayList<>(contacts.size());
        for (VcardContact contact : contacts) {
            cards.add(card(contact, language));
        }
        return Ezvcard.write(cards).version(VCardVersion.V3_0).prodId(false).go();
    }

    private static VCard card(VcardContact contact, String language) {
        VCard card = new VCard();
        StructuredName name = new StructuredName();
        name.setFamily(contact.lastName());
        name.setGiven(contact.firstName());
        card.setStructuredName(name);
        card.setFormattedName(new FormattedName(fullName(contact)));
        if (contact.company() != null) {
            Organization organization = new Organization();
            organization.getValues().add(contact.company());
            card.setOrganization(organization);
        }
        if (contact.email() != null) {
            Email email = new Email(contact.email());
            email.getTypes().add(EmailType.INTERNET);
            card.addEmail(email);
        }
        if (contact.phone() != null) {
            card.addTelephoneNumber(contact.phone(), TelephoneType.VOICE);
        }
        if (contact.address() != null || contact.addressParts() != null || contact.country() != null) {
            card.addAddress(address(contact.address(), contact.addressParts(), contact.country(), language));
        }
        if (!contact.tags().isEmpty()) {
            Categories categories = new Categories();
            categories.getValues().addAll(contact.tags());
            card.setCategories(categories);
        }
        for (int i = 0; i < contact.attributes().size(); i++) {
            attribute(card, contact.attributes().get(i), "attr" + (i + 1), language);
        }
        if (contact.id() != null) {
            card.setUid(new Uid("urn:uuid:" + contact.id()));
        }
        if (contact.updatedAt() != null) {
            card.setRevision(new Revision(contact.updatedAt()));
        }
        return card;
    }

    private static String fullName(VcardContact contact) {
        if (contact.firstName() == null) {
            return contact.lastName();
        }
        return contact.lastName() == null ? contact.firstName() : contact.firstName() + " " + contact.lastName();
    }

    /** Dodatni atribut: tipizirana lastnost z oznako ključa ali (tip {@code OTHER}) par ključ/vrednost. */
    private static void attribute(VCard card, Attribute attribute, String group, String language) {
        VCardProperty typed = typedProperty(attribute, language);
        if (typed == null) {
            RawProperty key = card.addExtendedProperty(VcardMapping.KEY, VcardMapping.escape(attribute.key()));
            key.setGroup(group);
            RawProperty value = card.addExtendedProperty(
                    VcardMapping.VALUE, VcardMapping.escape(attribute.value() == null ? "" : attribute.value()));
            value.setGroup(group);
            return;
        }
        typed.setGroup(group);
        card.addProperty(typed);
        card.addExtendedProperty(VcardMapping.LABEL, VcardMapping.escape(attribute.key()))
                .setGroup(group);
        card.addExtendedProperty(VcardMapping.KEY, VcardMapping.escape(attribute.key()))
                .setGroup(group);
    }

    private static VCardProperty typedProperty(Attribute attribute, String language) {
        String value = attribute.value();
        return switch (attribute.type()) {
            case PHONE -> value == null ? null : new Telephone(value);
            case EMAIL -> value == null ? null : new Email(value);
            case URL -> value == null ? null : new Url(value);
            case NOTES -> value == null ? null : new Note(value);
            case DATE -> {
                try {
                    yield value == null ? null : new Birthday(LocalDate.parse(value));
                } catch (DateTimeParseException e) {
                    yield null;
                }
            }
            case ADDRESS ->
                attribute.parts() == null && value == null ? null : address(value, attribute.parts(), null, language);
            case OTHER -> null;
        };
    }

    /**
     * {@code ADR}: deli naslova ({@code ;;ulica;kraj;regija;poštna;država}, dodatna vrstica v drugem polju, parameter
     * {@code X-CM-PARTS}) ali nerazčlenjen naslov v delu ulice; država z imenom v jeziku in {@code X-CM-CC}.
     */
    private static ezvcard.property.Address address(String text, Address parts, String country, String language) {
        ezvcard.property.Address address = new ezvcard.property.Address();
        String code = country;
        if (parts == null) {
            address.setStreetAddress(text);
        } else {
            address.setStreetAddress(parts.street());
            address.setExtendedAddress(parts.extra());
            address.setLocality(parts.city());
            address.setRegion(parts.region());
            address.setPostalCode(parts.postalCode());
            address.getParameters().put(VcardMapping.PARTS, "1");
            if (parts.country() != null) {
                address.getParameters().put(VcardMapping.PARTS_COUNTRY, parts.country());
                if (code == null) {
                    code = parts.country();
                }
            }
        }
        if (code != null) {
            address.setCountry(CountryNames.display(code, language));
            address.getParameters().put(VcardMapping.COUNTRY_CODE, code);
        }
        return address;
    }
}
