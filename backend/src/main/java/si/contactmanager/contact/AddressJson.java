package si.contactmanager.contact;

import tools.jackson.databind.json.JsonMapper;

/**
 * Zapis delov naslova v stolpcih {@code jsonb} ({@code contact.address_parts}, {@code contact_attribute.parts}; 016,
 * research R-04): prazni deli izpuščeni, {@code null} ostane {@code null}.
 */
final class AddressJson {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private AddressJson() {}

    static String write(Address address) {
        return address == null ? null : JSON.writeValueAsString(address);
    }

    static Address read(String json) {
        return json == null ? null : JSON.readValue(json, Address.class);
    }
}
