package si.contactmanager.contact;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Strukturiran naslov (016, FR-016-12; data-model.md – Address). Vsi deli so neobvezni, vsaj {@code street} ali
 * {@code city} je obvezen (preveri {@code TypedValues}); prazni deli so v JSON izpuščeni, {@code country} je koda ISO.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record Address(String street, String extra, String postalCode, String city, String region, String country) {}
