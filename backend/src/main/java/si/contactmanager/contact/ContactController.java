package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.contact.ContactInputParser.Parsed;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Endpointi kontaktov (plan.md – REST endpoints). Dostop do skupine preveri {@link GroupAccess} (feature-map §2.2,
 * koraki 2–4), za obstoječ kontakt pa {@link ContactService#requireWritable} v vrstnem redu D-41.
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class ContactController {

    private static final int DEFAULT_SIZE = 25;
    private static final Set<Integer> PAGE_SIZES = Set.of(25, 50, 100);

    private final ContactService service;
    private final GroupAccess access;
    private final ContactInputParser parser;

    ContactController(ContactService service, GroupAccess access, JsonMapper json) {
        this.service = service;
        this.access = access;
        this.parser = new ContactInputParser(json);
    }

    /** Seznam kontaktov skupine (FR-004-06); dovoljeno vsem članom, tudi v arhivirani skupini. */
    @GetMapping("/contacts")
    ContactPage list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = parsePage(page, errors);
        Integer pageSize = parseSize(size, errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.list(membership, pageNumber, pageSize);
    }

    /** Pogled kontakta (FR-004-08). */
    @GetMapping("/contacts/{contactId}")
    ContactDetail get(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, @PathVariable String contactId) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        return service.read(membership, parseId(contactId));
    }

    /** Nov kontakt (FR-004-01, FR-004-02): urednik ali višje v nearhivirani skupini. */
    @PostMapping("/contacts")
    ResponseEntity<ContactDetail> create(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, true);
        Parsed parsed = parser.parseCreate(body);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(membership, parsed.input()));
    }

    /** Urejanje kontakta (FR-004-10, FR-004-11). */
    @PutMapping("/contacts/{contactId}")
    ContactDetail update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID id = parseId(contactId);
        service.requireWritable(membership, id);
        return service.update(membership, id, parser.parseUpdate(body));
    }

    /** Izbris kontakta (FR-004-12, FR-004-13): verzija v poizvedbi, preveri se šele po 404, 403 in 409 (D-41). */
    @DeleteMapping("/contacts/{contactId}")
    ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String version) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID id = parseId(contactId);
        service.requireWritable(membership, id);
        service.delete(membership, id, parseVersion(version));
        return ResponseEntity.noContent().build();
    }

    /** Možnosti filtrov skupine (FR-008-06): dodatni ključi in značke; ogrodje 008 vrne 501. */
    @GetMapping("/contact-filters")
    ResponseEntity<ContactFilterOptions> filterOptions(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId) {
        access.require(jwt, groupId, Role.VIEWER, false);
        return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).build();
    }

    /** Predlogi značk skupine (FR-004-04): urednik ali višje, tudi v arhivirani skupini (samo branje). */
    @GetMapping("/tags")
    TagSuggestions tags(
            @AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, @RequestParam(required = false) String q) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, false);
        return service.suggestTags(membership, q);
    }

    private static UUID parseId(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
    }

    private static Integer parsePage(String value, List<FieldError> errors) {
        if (value == null) {
            return 0;
        }
        try {
            int number = Integer.parseInt(value);
            if (number >= 0) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError("page", "INVALID_VALUE"));
        return null;
    }

    private static Integer parseSize(String value, List<FieldError> errors) {
        if (value == null) {
            return DEFAULT_SIZE;
        }
        try {
            int number = Integer.parseInt(value);
            if (PAGE_SIZES.contains(number)) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError("size", "INVALID_VALUE"));
        return null;
    }

    private static long parseVersion(String value) {
        try {
            if (value != null) {
                long version = Long.parseLong(value);
                if (version >= 0) {
                    return version;
                }
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        throw new ValidationException(List.of(new FieldError("version", value == null ? "REQUIRED" : "INVALID_VALUE")));
    }
}
