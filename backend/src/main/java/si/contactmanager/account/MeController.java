package si.contactmanager.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

/**
 * Profil prijavljenega uporabnika (plan.md – REST endpoints). Uporabnik se določi samo iz žetona (FR-001-07); poti
 * nimajo identifikatorja uporabnika, zato tujega profila ni mogoče nasloviti (FR-001-08).
 */
@RestController
@RequestMapping("/api/me")
class MeController {

    private final ProfileRepository profiles;
    private final PreferencesParser parser;

    MeController(ProfileRepository profiles, JsonMapper json) {
        this.profiles = profiles;
        this.parser = new PreferencesParser(json);
    }

    /** Registracija ali posodobitev ob prijavi (FR-001-02, FR-001-03, FR-001-19). */
    @PutMapping
    ResponseEntity<Profile> sync(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String body) {
        Preferences device = body == null || body.isBlank() ? Preferences.NONE : parser.parse(body);
        ProfileRepository.Result result = profiles.sync(identity(jwt), device);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .body(result.profile());
    }

    /** Sprememba izbire jezika in teme (FR-001-15, FR-001-17, FR-001-19). */
    @PutMapping("/preferences")
    ResponseEntity<Profile> updatePreferences(
            @AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) String body) {
        Preferences preferences = parser.parse(body == null ? "" : body);
        return ResponseEntity.ok(
                profiles.savePreferences(identity(jwt), preferences).profile());
    }

    private static ProfileRepository.Identity identity(Jwt jwt) {
        return new ProfileRepository.Identity(
                jwt.getSubject(), jwt.getClaimAsString("name"), jwt.getClaimAsString("email"));
    }
}
