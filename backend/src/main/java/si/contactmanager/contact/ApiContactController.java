package si.contactmanager.contact;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.apikey.ApiGroupAccess;
import si.contactmanager.contact.ContactInputParser.Parsed;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.security.ApiKeyPrincipal;
import tools.jackson.databind.json.JsonMapper;

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
    private final ContactInputParser parser;

    ApiContactController(ContactService service, ApiGroupAccess access, JsonMapper json) {
        this.service = service;
        this.access = access;
        this.parser = new ContactInputParser(json);
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
        return service.read(membership, ContactController.parseId(contactId));
    }

    /** Nov kontakt (FR-019-10): urednik ali višje, ključ s pravico pisanja, nearhivirana skupina. */
    @PostMapping("/contacts")
    ResponseEntity<ContactDetail> create(
            @AuthenticationPrincipal ApiKeyPrincipal principal,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(principal, groupId, Role.EDITOR, true);
        Parsed parsed = parser.parseCreate(body);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(membership, parsed.input(), parsed.extras()));
    }

    /** Sprememba kontakta (FR-019-10, -11): verzija v telesu. */
    @PutMapping("/contacts/{contactId}")
    ContactDetail update(
            @AuthenticationPrincipal ApiKeyPrincipal principal,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(principal, groupId, Role.VIEWER, false);
        UUID id = ContactController.parseId(contactId);
        service.requireWritable(membership, id);
        return service.update(membership, id, parser.parseUpdate(body));
    }

    /** Izbris kontakta (FR-019-10, -11): verzija v poizvedbi, preveri se po 404, 403 in 409. */
    @DeleteMapping("/contacts/{contactId}")
    ResponseEntity<Void> delete(
            @AuthenticationPrincipal ApiKeyPrincipal principal,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String version) {
        Membership membership = access.require(principal, groupId, Role.VIEWER, false);
        UUID id = ContactController.parseId(contactId);
        service.requireWritable(membership, id);
        service.delete(membership, id, ContactController.parseVersion(version));
        return ResponseEntity.noContent().build();
    }
}
