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
        String email,
        String phone,
        List<Attribute> attributes,
        List<String> tags) {}
