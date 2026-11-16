package si.contactmanager.contact;

import java.util.List;

/**
 * Podatki kontakta iz telesa zahtevka po razčlenitvi (R-06): vrednosti obrezane, prazna neobvezna polja {@code null},
 * prazne vrstice atributov odstranjene. Seznama sta vedno neničelna.
 */
public record ContactInput(
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
    /** Stanje brez razčlenjenega naslova (pred 016): {@code addressParts} je {@code null}. */
    public ContactInput(
            String firstName,
            String lastName,
            String address,
            String email,
            String phone,
            String company,
            String country,
            List<Attribute> attributes,
            List<String> tags) {
        this(firstName, lastName, address, null, email, phone, company, country, attributes, tags);
    }
}
