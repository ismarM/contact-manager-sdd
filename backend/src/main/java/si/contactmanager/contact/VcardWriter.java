package si.contactmanager.contact;

import ezvcard.Ezvcard;
import ezvcard.VCard;
import ezvcard.VCardVersion;
import ezvcard.parameter.EmailType;
import ezvcard.parameter.TelephoneType;
import ezvcard.property.Address;
import ezvcard.property.Categories;
import ezvcard.property.Email;
import ezvcard.property.FormattedName;
import ezvcard.property.Organization;
import ezvcard.property.RawProperty;
import ezvcard.property.Revision;
import ezvcard.property.StructuredName;
import ezvcard.property.Uid;
import java.util.ArrayList;
import java.util.List;

/**
 * Zapis kontaktov kot vizitk vCard 3.0 v UTF-8 (FR-014-11, research R-03): {@code N}, {@code FN}, {@code ORG},
 * {@code EMAIL}, {@code TEL}, {@code ADR} (naslov v ulici, ime države v jeziku in {@code X-CM-CC}), {@code CATEGORIES},
 * dodatni atributi kot pari {@code X-CM-KEY}/{@code X-CM-VALUE} v skupini {@code attrN}; {@code UID} in {@code REV}
 * samo, kadar sta znana.
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
        if (contact.address() != null || contact.country() != null) {
            Address address = new Address();
            address.setStreetAddress(contact.address());
            if (contact.country() != null) {
                address.setCountry(CountryNames.display(contact.country(), language));
                address.getParameters().put(VcardMapping.COUNTRY_CODE, contact.country());
            }
            card.addAddress(address);
        }
        if (!contact.tags().isEmpty()) {
            Categories categories = new Categories();
            categories.getValues().addAll(contact.tags());
            card.setCategories(categories);
        }
        for (int i = 0; i < contact.attributes().size(); i++) {
            Attribute attribute = contact.attributes().get(i);
            String group = "attr" + (i + 1);
            RawProperty key = card.addExtendedProperty(VcardMapping.KEY, VcardMapping.escape(attribute.key()));
            key.setGroup(group);
            RawProperty value = card.addExtendedProperty(VcardMapping.VALUE, VcardMapping.escape(attribute.value()));
            value.setGroup(group);
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
}
