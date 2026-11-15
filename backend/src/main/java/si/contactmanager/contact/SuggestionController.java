package si.contactmanager.contact;

import java.util.ArrayList;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.group.GroupAccess.Membership;
import si.contactmanager.group.Role;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Predlogi skupine (plan.md – REST endpoints; FR-013-09, -11, -12, -14, -16): urednik ali višje, tudi v arhivirani
 * skupini (samo branje). Vrstni red: 401 → 404 → 403 → 400. Odgovor vsebuje samo besedilo in število, nikoli
 * identifikatorjev kontaktov.
 */
@RestController
@RequestMapping("/api/groups/{groupId}/suggestions")
class SuggestionController {

    private static final int Q_MAX = 100;
    private static final int KEY_MAX = ContactInputParser.KEY_MAX;

    private final SuggestionRepository repository;
    private final GroupAccess access;

    SuggestionController(SuggestionRepository repository, GroupAccess access) {
        this.repository = repository;
        this.access = access;
    }

    @GetMapping
    Suggestions suggestions(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String groupId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String key) {
        Membership membership = access.require(jwt, groupId, Role.EDITOR, false);
        List<FieldError> errors = new ArrayList<>();
        String text = q == null ? "" : q.strip();
        if (type == null) {
            errors.add(new FieldError("type", "REQUIRED"));
        } else if (!List.of("key", "value", "company", "tag", "country").contains(type)) {
            errors.add(new FieldError("type", "INVALID_VALUE"));
        }
        if (text.codePointCount(0, text.length()) > Q_MAX) {
            errors.add(new FieldError("q", "TOO_LONG"));
        } else if ("country".equals(type) && !text.isEmpty()) {
            errors.add(new FieldError("q", "INVALID_VALUE"));
        }
        String keyNorm = key == null ? "" : ContactInputParser.normalize(key.strip());
        if ("value".equals(type) && keyNorm.isEmpty()) {
            errors.add(new FieldError("key", "REQUIRED"));
        } else if (keyNorm.codePointCount(0, keyNorm.length()) > KEY_MAX) {
            errors.add(new FieldError("key", "TOO_LONG"));
        }
        if (!errors.isEmpty()) {
            throw new ValidationException(errors);
        }
        var group = membership.groupId();
        List<Suggestion> items = switch (type) {
            case "key" -> repository.keys(group, text);
            case "value" -> repository.values(group, keyNorm, text);
            case "company" -> repository.companies(group, text);
            case "tag" -> repository.tags(group, text);
            default -> repository.countries(group);
        };
        return new Suggestions(items);
    }
}
