package si.contactmanager.contact;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.util.WebUtils;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Uvoz kontaktov (014 plan.md – REST endpoints): razčlenitev datoteke, predogled in potrditev; vsi trije so pisanje
 * (EDITOR, v arhivirani skupini {@code 409 GROUP_ARCHIVED}). Vrstni red: 401 → 404 → 403 → 409 → 400 (feature-map
 * §2.2); datoteka se razčleni leno, šele po preverjanju dostopa, in se ne hrani.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/imports")
class ImportController {

    /** Največja datoteka (FR-014-08); multipart ima enako mejo ({@code application.yaml}). */
    static final long MAX_FILE = 10L * 1024 * 1024;

    private static final Set<String> LANGUAGES = Set.of("sl", "en");

    record SheetResponse(
            String format,
            int sheetCount,
            List<String> headers,
            List<HeaderMapping.Suggestion> suggestedMapping,
            List<XlsxSheetReader.SheetRow> rows) {}

    record CardsResponse(String format, List<ImportCandidate> candidates, List<String> omitted) {}

    private final GroupAccess access;
    private final ImportService service;
    private final ImportInputParser parser;

    ImportController(GroupAccess access, ImportService service, JsonMapper json) {
        this.access = access;
        this.service = service;
        this.parser = new ImportInputParser(json);
    }

    @PostMapping("/parse")
    Object parse(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, HttpServletRequest request) {
        access.require(jwt, groupId, Role.EDITOR, true);
        MultipartHttpServletRequest multipart = WebUtils.getNativeRequest(request, MultipartHttpServletRequest.class);
        if (multipart == null) {
            throw new ValidationException(List.of(new FieldError("file", "REQUIRED")));
        }
        MultipartFile file = multipart.getFile("file");
        String format = multipart.getParameter("format");
        String language = multipart.getParameter("language");
        List<FieldError> errors = new ArrayList<>();
        if (file == null || file.isEmpty()) {
            errors.add(new FieldError("file", "REQUIRED"));
        } else if (file.getSize() > MAX_FILE) {
            errors.add(new FieldError("file", "FILE_TOO_LARGE"));
        }
        if (!"XLSX".equals(format) && !"VCF".equals(format)) {
            errors.add(new FieldError("format", format == null ? "REQUIRED" : "INVALID_VALUE"));
        }
        if (language != null && !LANGUAGES.contains(language)) {
            errors.add(new FieldError("language", "INVALID_VALUE"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new ValidationException(List.of(new FieldError("file", "REQUIRED")));
        }
        if ("XLSX".equals(format)) {
            try {
                XlsxSheetReader.Sheet1 sheet = XlsxSheetReader.read(bytes);
                return new SheetResponse(
                        "XLSX",
                        sheet.sheetCount(),
                        sheet.headers(),
                        HeaderMapping.suggest(sheet.headers()),
                        sheet.rows());
            } catch (XlsxGuard.Rejected e) {
                throw new ValidationException(List.of(new FieldError("file", e.code())));
            }
        }
        try {
            VcardReader.Result result =
                    VcardReader.read(new String(bytes, StandardCharsets.UTF_8), language == null ? "sl" : language);
            return new CardsResponse(
                    "VCF",
                    result.candidates(),
                    result.omitted().stream().sorted().toList());
        } catch (VcardReader.Invalid e) {
            throw new ValidationException(List.of(new FieldError("file", e.code())));
        }
    }

    @PostMapping("/preview")
    ImportService.Preview preview(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, true);
        return service.preview(membership, parser.candidates(body));
    }

    @PostMapping
    ResponseEntity<ImportService.Created> commit(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, true);
        ImportInputParser.Commit commit = parser.commit(body);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.commit(membership, commit.contacts()));
    }
}
