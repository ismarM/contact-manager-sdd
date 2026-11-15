package si.contactmanager.account;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.shared.error.AppPasswordLimitException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.UnauthenticatedException;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Gesla za aplikacijo prijavljenega uporabnika (FR-014-21, -25; contracts/openapi.yaml): seznam brez gesel, novo geslo
 * (vrednost samo v tem odgovoru) in preklic. Vir je vezan na uporabnika: 401 brez prijave, 404 za tuje geslo.
 */
@RestController
@RequestMapping("/api/me/app-passwords")
class AppPasswordController {

    /** Največ gesel na uporabnika (FR-014-21). */
    static final int LIMIT = 10;

    static final int NAME_MAX = 50;

    record Item(UUID id, String name, Instant createdAt, Instant lastUsedAt) {}

    record Items(List<Item> items) {}

    record Created(UUID id, String name, Instant createdAt, Instant lastUsedAt, String password, String username) {}

    private final UserDirectory users;
    private final AppPasswordRepository repository;
    private final JsonMapper json;

    AppPasswordController(UserDirectory users, AppPasswordRepository repository, JsonMapper json) {
        this.users = users;
        this.repository = repository;
        this.json = json;
    }

    @GetMapping
    ResponseEntity<Items> list(@AuthenticationPrincipal Jwt jwt) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        List<Item> items = repository.list(user).stream()
                .map(p -> new Item(p.id(), p.name(), p.createdAt(), p.lastUsedAt()))
                .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Items(items));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<Created> create(
            @AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String body) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        String name = name(body);
        if (repository.lockAndCount(user) >= LIMIT) {
            throw new AppPasswordLimitException();
        }
        String password = AppPasswords.generate();
        AppPasswordRepository.Listed created = repository.insert(user, name, AppPasswords.hash(password));
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(new Created(
                        created.id(), created.name(), created.createdAt(), null, password, repository.email(user)));
    }

    @DeleteMapping("/{passwordId}")
    ResponseEntity<Void> revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable String passwordId) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        UUID id;
        try {
            id = UUID.fromString(passwordId);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
        if (!repository.delete(user, id)) {
            throw new NotFoundException();
        }
        return ResponseEntity.noContent().build();
    }

    private String name(String body) {
        JsonNode root;
        try {
            root = json.readTree(body == null ? "" : body);
        } catch (JacksonException e) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        if (root == null || !root.isObject()) {
            throw new ValidationException(List.of(new FieldError("body", "MALFORMED")));
        }
        for (var property : root.properties()) {
            if (!property.getKey().equals("name")) {
                throw new ValidationException(List.of(new FieldError(property.getKey(), "UNKNOWN_FIELD")));
            }
        }
        JsonNode node = root.get("name");
        if (node != null && !node.isNull() && !node.isString()) {
            throw new ValidationException(List.of(new FieldError("name", "INVALID_VALUE")));
        }
        String name = node == null || node.isNull() ? "" : node.asString().strip();
        if (name.isEmpty()) {
            throw new ValidationException(List.of(new FieldError("name", "REQUIRED")));
        }
        if (name.codePointCount(0, name.length()) > NAME_MAX) {
            throw new ValidationException(List.of(new FieldError("name", "TOO_LONG")));
        }
        return name;
    }
}
