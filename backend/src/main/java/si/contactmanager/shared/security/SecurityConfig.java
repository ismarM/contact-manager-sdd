package si.contactmanager.shared.security;

import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.SecurityContext;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import si.contactmanager.shared.error.ErrorResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * Javno je samo {@code GET /api/health} (FR-000-10); vse ostalo zahteva veljaven ID žeton Firebase (FR-001-07). Vsaka
 * neuspešna prijava – brez žetona, neveljaven, ponarejen, potekel – vrne 401 UNAUTHENTICATED.
 */
@Configuration
@EnableConfigurationProperties(FirebaseProperties.class)
public class SecurityConfig {

    private static final ErrorResponse UNAUTHENTICATED = new ErrorResponse("UNAUTHENTICATED");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JsonMapper json, JwtDecoder decoder) throws Exception {
        AuthenticationEntryPoint unauthenticated = (request, response, exception) -> unauthenticated(response, json);
        return http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.GET, "/api/health")
                        .permitAll()
                        .requestMatchers("/error")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .oauth2ResourceServer(resourceServer ->
                        resourceServer.jwt(jwt -> jwt.decoder(decoder)).authenticationEntryPoint(unauthenticated))
                .exceptionHandling(errors -> errors.authenticationEntryPoint(unauthenticated)
                        .accessDeniedHandler((request, response, exception) -> unauthenticated(response, json)))
                .build();
    }

    @Bean
    JwtDecoder firebaseJwtDecoder(FirebaseProperties firebase) throws URISyntaxException, IOException {
        if (firebase.projectId() == null || firebase.projectId().isBlank()) {
            throw new IllegalStateException("firebase.project-id (FIREBASE_PROJECT_ID) is required");
        }
        Clock clock = Clock.systemUTC();
        if (firebase.emulator()) {
            return FirebaseJwtDecoder.emulator(firebase.projectId(), clock);
        }
        URL jwkSetUrl = new URI(FirebaseJwtDecoder.GOOGLE_JWK_SET_URI).toURL();
        JWKSource<SecurityContext> keys =
                JWKSourceBuilder.create(jwkSetUrl).retrying(true).build();
        return FirebaseJwtDecoder.production(firebase.projectId(), keys, clock);
    }

    private static void unauthenticated(HttpServletResponse response, JsonMapper json) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getWriter(), UNAUTHENTICATED);
    }
}
