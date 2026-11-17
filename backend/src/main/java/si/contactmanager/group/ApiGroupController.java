package si.contactmanager.group;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import si.contactmanager.shared.security.ApiKeyPrincipal;

/**
 * Seznam skupin za API ključ (019, FR-019-06): skupine v obsegu ključa, katerih član je uporabnik ob zahtevi (tudi
 * arhivirane), s podatki skupine in uporabnikovo vlogo. Paginacija kot pri seznamih spletne aplikacije.
 */
@RestController
@RequestMapping("/v1/groups")
class ApiGroupController {

    private static final int DEFAULT_SIZE = 25;
    private static final int MAX_SIZE = 100;

    private final GroupService service;

    ApiGroupController(GroupService service) {
        this.service = service;
    }

    @GetMapping
    ApiGroupPage list(
            @AuthenticationPrincipal ApiKeyPrincipal principal,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        List<FieldError> errors = new ArrayList<>();
        Integer pageNumber = parseInt(page, 0, 0, Integer.MAX_VALUE, "page", errors);
        Integer pageSize = parseInt(size, DEFAULT_SIZE, 1, MAX_SIZE, "size", errors);
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        ApiKeyPrincipal.Scope scope = principal.scope();
        List<UUID> groups =
                scope.all() != null ? null : List.copyOf(scope.groups().keySet());
        return service.listForApi(principal.userId(), groups, pageNumber, pageSize);
    }

    private static Integer parseInt(
            String value, int fallback, int min, int max, String field, List<FieldError> errors) {
        if (value == null) {
            return fallback;
        }
        try {
            int number = Integer.parseInt(value);
            if (number >= min && number <= max) {
                return number;
            }
        } catch (NumberFormatException e) {
            // obravnavano spodaj
        }
        errors.add(new FieldError(field, "INVALID_VALUE"));
        return null;
    }
}
