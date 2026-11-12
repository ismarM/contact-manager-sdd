package si.contactmanager.contact;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import si.contactmanager.contact.BulkInputParser.Parsed;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Izvoz izbranih kontaktov v Excel (010, plan.md – REST endpoints). Vrstni red preverjanj (research R-04): 401 → 404
 * (nečlan, skupina ali identiteta, ki nikoli ni bila kontakt skupine) → 400 {@code VALIDATION_FAILED} → 409
 * {@code EXPORT_EMPTY}. Ni 403 in {@code GROUP_ARCHIVED}: izvoz je branje, dovoljeno vsem članom (FR-010-16).
 */
@RestController
@RequestMapping("/api/groups/{groupId}")
class ExportController {

    private static final MediaType XLSX =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final GroupAccess access;
    private final BulkService bulk;
    private final ExportService service;
    private final ExportRequestParser parser;

    ExportController(GroupAccess access, BulkService bulk, ExportService service, JsonMapper json) {
        this.access = access;
        this.bulk = bulk;
        this.service = service;
        this.parser = new ExportRequestParser(json);
    }

    @PostMapping("/contacts/export")
    ResponseEntity<StreamingResponseBody> export(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        Set<UUID> identities = parser.identities(body);
        if (identities != null && !identities.isEmpty()) {
            bulk.requireKnown(membership, identities);
        }
        Parsed<ExportRequest> parsed = parser.parse(body);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        // Branje, štetje in EXPORT_EMPTY / TOO_MANY_COLUMNS pred začetkom toka, da je napaka še lahko JSON.
        ExportService.Prepared prepared = service.prepare(membership, parsed.value());
        List<ExportRow> rows = prepared.rows();
        StreamingResponseBody stream = out -> ExportWriter.write(out, prepared.language(), prepared.columns(), rows);
        return ResponseEntity.ok()
                .contentType(XLSX)
                .header("X-Export-Count", String.valueOf(rows.size()))
                .header("X-Export-Skipped", String.valueOf(prepared.skipped()))
                .header("Content-Disposition", "attachment; filename=\"contacts.xlsx\"")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(stream);
    }
}
