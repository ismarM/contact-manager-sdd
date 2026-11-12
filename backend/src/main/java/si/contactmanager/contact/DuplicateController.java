package si.contactmanager.contact;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.List;
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
import si.contactmanager.shared.error.ForbiddenException;
import si.contactmanager.shared.error.GroupArchivedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Endpointi dvojnikov (plan.md – REST endpoints). Vrstni red preverjanj (feature-map §2.2, research R-07): 401 → 404
 * (nečlan, skupina ali identiteta, ki nikoli ni bila kontakt skupine) → 403 → 409 {@code GROUP_ARCHIVED} → 400
 * (zgradba) → 409 {@code VERSION_CONFLICT} (samo {@code merge}, v servisu) → 400 ({@code result.*}).
 */
@RestController
@RequestMapping("/api/groups/{groupId}/duplicates")
class DuplicateController {

    private static final Set<String> CATEGORIES = Set.of("name", "email", "phone");
    private static final Set<Integer> SIZES = Set.of(25, 50, 100);
    private static final int DEFAULT_SIZE = 25;

    private final GroupAccess access;
    private final DuplicateService service;
    private final MergeInputParser parser = new MergeInputParser();

    DuplicateController(GroupAccess access, DuplicateService service) {
        this.access = access;
        this.service = service;
    }

    /** Iskanje dvojnikov (FR-011-02 … FR-011-07): urednik ali višje v nearhivirani skupini. */
    @GetMapping
    DuplicatePage search(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, HttpServletRequest request) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, true);
        List<FieldError> errors = new ArrayList<>();
        String category = request.getParameter("category");
        if (category == null || category.isEmpty()) {
            errors.add(new FieldError("category", "REQUIRED"));
        } else if (!CATEGORIES.contains(category)) {
            errors.add(new FieldError("category", "INVALID_VALUE"));
        }
        int size = integer(request.getParameter("size"), DEFAULT_SIZE, "size", errors);
        if (!errors.stream().anyMatch(e -> e.field().equals("size")) && !SIZES.contains(size)) {
            errors.add(new FieldError("size", "INVALID_VALUE"));
        }
        int page = integer(request.getParameter("page"), 0, "page", errors);
        if (page < 0 && errors.stream().noneMatch(e -> e.field().equals("page"))) {
            errors.add(new FieldError("page", "INVALID_VALUE"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        return service.search(membership, category, page, size);
    }

    /** Primerjava (FR-011-08, FR-011-20, FR-011-21): 2–10 kontaktov te skupine. */
    @GetMapping("/compare")
    Comparison compare(@AuthenticationPrincipal Jwt jwt, @PathVariable String groupId, HttpServletRequest request) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        String[] values = request.getParameterValues("ids");
        List<String> raw = values == null ? List.of() : List.of(values);
        requireKnown(membership, parser.identities(raw));
        requireWritable(membership);
        MergeInputParser.Parsed<List<UUID>> ids = parser.parseIds(raw);
        if (!ids.valid()) {
            throw new ValidationException(ids.errors());
        }
        return service.compare(membership, ids.value());
    }

    /** Združitev (FR-011-13 … FR-011-17, FR-011-19, FR-011-20). */
    @PostMapping("/merge")
    MergeResult merge(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestBody(required = false) String body) {
        Membership membership = access.require(jwt, groupId, Role.VIEWER, false);
        requireKnown(membership, parser.identities(body));
        requireWritable(membership);
        MergeInputParser.Parsed<List<MergeInput.Target>> targets = parser.parseTargets(body);
        if (!targets.valid()) {
            throw new ValidationException(targets.errors());
        }
        return service.merge(membership, targets.value(), body);
    }

    /** Korak 404 nad veljavnimi identitetami; pri več kot 10 se baza ne obišče (R-07). */
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

    private static int integer(String text, int fallback, String field, List<FieldError> errors) {
        if (text == null || text.isEmpty()) {
            return fallback;
        }
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            errors.add(new FieldError(field, "INVALID_VALUE"));
            return fallback;
        }
    }
}
