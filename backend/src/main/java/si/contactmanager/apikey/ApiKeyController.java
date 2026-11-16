package si.contactmanager.apikey;

import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import si.contactmanager.account.UserDirectory;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.error.UnauthenticatedException;
import tools.jackson.databind.json.JsonMapper;

/**
 * API ključi prijavljenega uporabnika (019, FR-019-01 … -04, -18; plan.md *Public Interfaces*): seznam brez žetonov,
 * nov ključ (žeton samo v tem odgovoru) in preklic. Samo Firebase prijava ({@code /api/**}); API ključ tu ne velja (401).
 * Vir je vezan na uporabnika: 401 brez prijave, 404 za tuj ključ. Brez sveže prijave (research R-09).
 */
@RestController
@RequestMapping("/api/me/api-keys")
class ApiKeyController {

    private final UserDirectory users;
    private final ApiKeyService service;
    private final JsonMapper json;

    ApiKeyController(UserDirectory users, ApiKeyService service, JsonMapper json) {
        this.users = users;
        this.service = service;
        this.json = json;
    }

    @GetMapping
    ResponseEntity<List<ApiKeyService.KeyView>> list(@AuthenticationPrincipal Jwt jwt) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(user));
    }

    @PostMapping
    ResponseEntity<ApiKeyService.Created> create(
            @AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String body) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        ApiKeyService.Created created = service.create(user, ApiKeyInputParser.parse(json, body));
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(created);
    }

    @DeleteMapping("/{keyId}")
    ResponseEntity<Void> revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable String keyId) {
        long user = users.find(jwt).orElseThrow(UnauthenticatedException::new);
        UUID id;
        try {
            id = UUID.fromString(keyId);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException();
        }
        service.revoke(user, id);
        return ResponseEntity.noContent().build();
    }
}
