package si.contactmanager.member;

import java.util.List;
import java.util.UUID;
import si.contactmanager.shared.error.ValidationError.FieldError;

/** Razčlenitev teles {@code PUT …/members/{memberId}} in {@code POST …/ownership-transfer}. Ogrodje (007, T006). */
final class MemberInputParser {

    /** Rezultat razčlenjevanja vloge: {@code role} je znana vloga ali {@code null}. */
    record ParsedRole(String role, Long version, List<FieldError> errors) {}

    /** Rezultat razčlenjevanja prenosa: {@code memberId} ali {@code null}. */
    record ParsedTransfer(UUID memberId, List<FieldError> errors) {}

    ParsedRole parseRole(String body) {
        throw new UnsupportedOperationException("not implemented");
    }

    ParsedTransfer parseTransfer(String body) {
        throw new UnsupportedOperationException("not implemented");
    }
}
