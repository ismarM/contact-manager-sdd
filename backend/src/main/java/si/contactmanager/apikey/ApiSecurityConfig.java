package si.contactmanager.apikey;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import si.contactmanager.shared.error.ErrorResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * Ločena varnostna veriga za programski vmesnik {@code /v1/**} (019, research R-02;
 * docs/decisions/2026-11-16-api-kljuc-jwt.md): stateless, brez CSRF, CORS, HTTP Basic in obrazca; velja samo API ključ
 * v {@code Authorization: Bearer cmk_…}. Firebase žeton tu ne velja (ni {@code oauth2ResourceServer}). Javen je samo
 * {@code GET /v1/openapi.json}. Vrstni red: CardDAV {@code @Order(1)}, ta veriga {@code @Order(2)}, veriga
 * {@code /api} ({@code SecurityConfig}) za vse ostalo.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(ApiKeyProperties.class)
public class ApiSecurityConfig {

    private static final ErrorResponse UNAUTHENTICATED = new ErrorResponse("UNAUTHENTICATED");

    /** Ura za štetje zahtev in čiščenje (teste nadomesti s fiksno uro). */
    @Bean
    Clock apiKeyClock() {
        return Clock.systemUTC();
    }

    @Bean
    @Order(2)
    SecurityFilterChain apiKeyFilterChain(
            HttpSecurity http,
            JsonMapper json,
            ApiKeyTokens tokens,
            ApiKeyRepository keys,
            ApiUsageRepository usage,
            Clock clock)
            throws Exception {
        AuthenticationEntryPoint unauthenticated = (request, response, exception) -> unauthenticated(response, json);
        return http.securityMatcher("/v1/**")
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(AbstractHttpConfigurer::disable)
                .cors(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .addFilterBefore(new ApiKeyAuthenticationFilter(tokens, keys), AnonymousAuthenticationFilter.class)
                .addFilterAfter(new ApiUsageFilter(usage, clock), ApiKeyAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.GET, "/v1/openapi.json")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(unauthenticated)
                        .accessDeniedHandler((request, response, exception) -> unauthenticated(response, json)))
                .build();
    }

    private static void unauthenticated(HttpServletResponse response, JsonMapper json) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getWriter(), UNAUTHENTICATED);
    }
}
