package si.contactmanager.shared.security;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import si.contactmanager.shared.error.ErrorResponse;
import tools.jackson.databind.json.JsonMapper;

/** Privzeta zavrnitev (FR-000-10): javno je samo {@code GET /api/health}, vse drugo vrne 401 UNAUTHENTICATED. */
@Configuration
public class SecurityConfig {

    private static final ErrorResponse UNAUTHENTICATED = new ErrorResponse("UNAUTHENTICATED");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JsonMapper json) throws Exception {
        return http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.GET, "/api/health")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(
                                (request, response, exception) -> unauthenticated(response, json))
                        .accessDeniedHandler((request, response, exception) -> unauthenticated(response, json)))
                .build();
    }

    private static void unauthenticated(HttpServletResponse response, JsonMapper json) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        json.writeValue(response.getWriter(), UNAUTHENTICATED);
    }
}
