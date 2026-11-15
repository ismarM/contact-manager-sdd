package si.contactmanager.contact;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Izvoz vizitk vCard (FR-014-10, -11; research R-05): izbor z enakimi pravili kot izvoz v Excel 010 (vrstni red
 * seznama, izpuščeni, {@code EXPORT_EMPTY}, meja, {@code 404} za tuj id) in en kontakt. Branje: vsi člani, tudi v
 * arhivirani skupini; ime datoteke sestavi odjemalec.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/contacts")
class VcardExportController {

    static final MediaType VCARD = new MediaType("text", "vcard", StandardCharsets.UTF_8);

    private static final Set<String> LANGUAGES = Set.of("sl", "en");

    private final GroupAccess access;
    private final BulkService bulk;
    private final ExportService export;
    private final ContactSnapshots snapshots;
    private final ExportRequestParser parser;

    VcardExportController(
            GroupAccess access, BulkService bulk, ExportService export, ContactSnapshots snapshots, JsonMapper json) {
        this.access = access;
        this.bulk = bulk;
        this.export = export;
        this.snapshots = snapshots;
        this.parser = new ExportRequestParser(json);
    }

    @PostMapping("/export/vcard")
    ResponseEntity<byte[]> exportSelection(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        Set<UUID> identities = parser.identities(body);
        if (identities != null && !identities.isEmpty()) {
            bulk.requireKnown(membership, identities);
        }
        BulkInputParser.Parsed<ExportRequest> parsed = parser.parse(body);
        if (!parsed.valid()) {
            throw new ValidationException(parsed.errors());
        }
        ExportService.Prepared prepared = export.prepare(membership, parsed.value());
        List<UUID> ids = prepared.rows().stream().map(ExportRow::id).toList();
        Map<UUID, ContactState> states = snapshots.load(membership.groupId(), ids);
        List<VcardContact> cards = new ArrayList<>(ids.size());
        for (UUID id : ids) {
            ContactState state = states.get(id);
            if (state != null) {
                cards.add(card(id, state));
            }
        }
        return ResponseEntity.ok()
                .contentType(VCARD)
                .header("X-Export-Count", String.valueOf(cards.size()))
                .header("X-Export-Skipped", String.valueOf(prepared.skipped()))
                .header("Content-Disposition", "attachment; filename=\"contacts.vcf\"")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(VcardWriter.write(cards, prepared.language()).getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/{contactId}/vcard")
    ResponseEntity<byte[]> exportOne(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @PathVariable String contactId,
            @RequestParam(required = false) String language) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        UUID id;
        try {
            id = UUID.fromString(contactId);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
        ContactState state = snapshots.snapshot(membership.groupId(), id);
        if (state == null) {
            throw new NotFoundException();
        }
        if (language != null && !LANGUAGES.contains(language)) {
            throw new ValidationException(List.of(new FieldError("language", "INVALID_VALUE")));
        }
        return ResponseEntity.ok()
                .contentType(VCARD)
                .header("Content-Disposition", "attachment; filename=\"contact.vcf\"")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(VcardWriter.write(List.of(card(id, state)), language == null ? "sl" : language)
                        .getBytes(StandardCharsets.UTF_8));
    }

    static VcardContact card(UUID id, ContactState state) {
        return new VcardContact(
                id,
                state.updatedAt(),
                state.firstName(),
                state.lastName(),
                state.address(),
                state.email(),
                state.phone(),
                state.company(),
                state.country(),
                state.attributes(),
                state.tags());
    }
}
