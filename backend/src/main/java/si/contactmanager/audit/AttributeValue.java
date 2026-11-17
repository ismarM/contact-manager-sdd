package si.contactmanager.audit;

import com.fasterxml.jackson.annotation.JsonInclude;
import si.contactmanager.contact.Address;
import si.contactmanager.contact.Attribute;
import si.contactmanager.contact.AttributeType;

/**
 * Vrednost atributa v {@link ChangeField} (016, FR-016-26): tip ključa ob posnetku ter besedilna vrednost ali deli
 * razčlenjenega naslova (natanko eno od {@code value} in {@code parts}).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AttributeValue(AttributeType type, String value, Address parts) {

    static AttributeValue of(Attribute attribute) {
        return new AttributeValue(attribute.type(), attribute.value(), attribute.parts());
    }
}
