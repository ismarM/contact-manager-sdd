package si.contactmanager.contact;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.apikey.ApiGroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.security.ApiKeyPrincipal;

/**
 * Kontakti za API ključ (019, FR-019-07 do -13): isti {@link ContactService}, {@link ContactQueryParser} in
 * {@link ContactInputParser} kot spletna aplikacija; razlika je samo prijava in obseg ključa ({@link ApiGroupAccess}).
 * Vrstni red: 401 → 404 (nečlan) → 404 (izven obsega) → 403 → 409 arhivirana → 409 verzija → 400.
 */
@RestController
@RequestMapping("/v1/groups/{groupId}")
class ApiContactController {

    private final ContactService service;
    private final ApiGroupAccess access;
    private final ContactQueryParser queryParser = new ContactQueryParser();

    ApiContactController(ContactService service, ApiGroupAccess access) {
        this.service = service;
        this.access = access;
    }

    /** Seznam kontaktov (FR-019-07): parametri in telo odgovora kot {@code GET /api/groups/{groupId}/contacts}. */
    @GetMapping("/contacts")
    ContactPage list(
            @AuthenticationPrincipal ApiKeyPrincipal principal,
            @PathVariable String groupId,
            HttpServletRequest request) {
        Membership membership = access.require(principal, groupId, Role.VIEWER, false);
        Map<String, List<String>> parameters = new LinkedHashMap<>();
        request.getParameterMap().forEach((name, values) -> parameters.put(name, List.of(values)));
        ContactQueryParser.Parsed parsed = queryParser.parse(parameters);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        return service.list(membership, parsed.query());
    }

    /** En kontakt z verzijo (FR-019-07). */
    @GetMapping("/contacts/{contactId}")
    ContactDetail get(
            @AuthenticationPrincipal ApiKeyPrincipal principal,
            @PathVariable String groupId,
            @PathVariable String contactId) {
        Membership membership = access.require(principal, groupId, Role.VIEWER, false);
        return service.read(membership, parseId(contactId));
    }

    private static UUID parseId(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }
}
