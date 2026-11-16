package si.contactmanager.maps;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import si.contactmanager.contact.Address;

/**
 * Predlog naslova samodokončanja (016, FR-016-13; contracts/openapi.yaml – AddressSuggestion): berljiva oznaka in deli
 * naslova v isti ravni; ni shranjen. Prazni deli so v JSON izpuščeni.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AddressSuggestion(
        String label, String street, String extra, String postalCode, String city, String region, String country) {

    public static AddressSuggestion of(String label, Address address) {
        return new AddressSuggestion(
                label,
                address.street(),
                address.extra(),
                address.postalCode(),
                address.city(),
                address.region(),
                address.country());
    }

    @JsonIgnore
    public Address address() {
        return new Address(street, extra, postalCode, city, region, country);
    }
}
