package si.contactmanager.contact;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.BulkValidationException;
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Endpointi izbora in množičnega urejanja (plan.md – REST endpoints). Vrstni red preverjanj (research R-02): 401 → 404
 * (nečlan, skupina ali identiteta, ki nikoli ni bila kontakt skupine) → 403 → 409 {@code GROUP_ARCHIVED} → 400 →
 * 409 {@code SELECTION_CHANGED} (v servisu).
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class BulkController {

    /** Največ različnih identitet v telesu {@code selection-check} (izbor in vsoti poizvedb, R-10). */
    private static final int CHECK_IDENTITIES = 3 * BulkInputParser.MAX_IDS;

    private final GroupAccess access;
    private final BulkService service;
    private final BulkInputParser parser;
    private final ContactQueryParser queryParser = new ContactQueryParser();

    BulkController(GroupAccess access, BulkService service, JsonMapper json) {
        this.access = access;
        this.service = service;
        this.parser = new BulkInputParser(json);
    }

    /** »Izberi vse zadetke« (FR-009-03, FR-009-04): vsi člani, tudi v arhivirani skupini. */
    @GetMapping("/contact-ids")
    ContactIds contactIds(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, HttpServletRequest request) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        Map<String, List<String>> parameters = new LinkedHashMap<>();
        request.getParameterMap().forEach((name, values) -> parameters.put(name, List.of(values)));
        ContactQueryParser.Parsed parsed = queryParser.parse(parameters);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        return service.contactIds(membership, parsed.query());
    }

    /** Preverjanje sprememb izbora (FR-009-18): samo branje, vsi člani, tudi v arhivirani skupini. */
    @PostMapping("/contacts/selection-check")
    SelectionCheck.Result selectionCheck(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        requireKnown(membership, parser.identities(body, true, CHECK_IDENTITIES));
        BulkInputParser.Parsed<SelectionCheck.Request> parsed = parser.parseCheck(body);
        if (!parsed.valid()) {
            throw new BulkValidationException(parsed.errors(), List.of());
        }
        return service.check(membership, parsed.value());
    }

    /** Množično urejanje (FR-009-06 … FR-009-12): urednik ali višje v nearhivirani skupini. */
    @PostMapping("/contacts/bulk-update")
    Changed bulkUpdate(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        requireKnown(membership, parser.identities(body, false, BulkInputParser.MAX_IDS));
        requireWritable(membership);
        BulkInputParser.Parsed<BulkEditInput> parsed = parser.parseUpdate(body);
        if (!parsed.valid()) {
            throw new BulkValidationException(parsed.errors(), List.of());
        }
        return new Changed(service.update(membership, parsed.value()));
    }

    /** Množični izbris (FR-009-13): urednik ali višje v nearhivirani skupini. */
    @PostMapping("/contacts/bulk-delete")
    Deleted bulkDelete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        requireKnown(membership, parser.identities(body, false, BulkInputParser.MAX_IDS));
        requireWritable(membership);
        BulkInputParser.Parsed<BulkTarget> parsed = parser.parseDelete(body);
        if (!parsed.valid()) {
            throw new BulkValidationException(parsed.errors(), List.of());
        }
        return new Deleted(service.delete(membership, parsed.value()));
    }

    /** Korak 2 (404) nad veljavnimi identitetami iz telesa; pri preveliki količini se baza ne obišče (R-15). */
    private void requireKnown(Membership membership, Set<UUID> identities) {
        if (identities != null && !identities.isEmpty()) {
            service.requireKnown(membership, identities);
        }
    }

    /** Koraka 3 in 4: vloga pod EDITOR → 403 (tudi v arhivirani skupini), arhivirana skupina → 409. */
    private static void requireWritable(Membership membership) {
        if (!membership.role().atLeast(Role.EDITOR)) {
            throw new ForbiddenException();
        }
        if (membership.archived()) {
            throw new GroupArchivedException();
        }
    }

    /** Odgovor množičnega urejanja. */
    record Changed(int changed) {}

    /** Odgovor množičnega izbrisa. */
    record Deleted(int deleted) {}
}
