package si.contactmanager.shared.security;

import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.firewall.StrictHttpFirewall;
import si.contactmanager.account.AppPasswordAuthenticator;
import si.contactmanager.account.AppPasswordAuthenticator.DavAccount;

/**
 * Ločena varnostna veriga za CardDAV (014 research R-08, R-09; docs/decisions/2026-11-15-gesla-za-aplikacijo-carddav.md):
 * poti {@code /dav/**} in {@code /.well-known/carddav}; stateless, brez CSRF, samo HTTP Basic z e-naslovom računa in
 * geslom za aplikacijo. Firebase JWT na teh poteh ne velja; neuspeh je {@code 401} z {@code WWW-Authenticate: Basic}.
 * Veriga {@code /api/**} ({@link SecurityConfig}) ostane nespremenjena. V produkciji je CardDAV dosegljiv samo prek HTTPS.
 */
@Configuration
public class DavSecurityConfig {

    static final String REALM = "Basic realm=\"Contact Manager\", charset=\"UTF-8\"";

    /** Metode WebDAV, ki jih {@link StrictHttpFirewall} privzeto zavrne (pisanje vrne krmilnik s 403). */
    static final List<String> METHODS = List.of(
            "GET",
            "HEAD",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
            "PROPFIND",
            "PROPPATCH",
            "REPORT",
            "MKCOL",
            "COPY",
            "MOVE",
            "LOCK",
            "UNLOCK");

    @Bean
    @Order(1)
    SecurityFilterChain davFilterChain(HttpSecurity http, AppPasswordAuthenticator authenticator) throws Exception {
        AuthenticationEntryPoint unauthenticated = (request, response, exception) -> {
            response.setHeader("WWW-Authenticate", REALM);
            response.setStatus(401);
        };
        AuthenticationManager manager = authentication -> {
            Optional<DavAccount> account = authenticator.authenticate(
                    authentication.getName(), String.valueOf(authentication.getCredentials()));
            if (account.isEmpty()) {
                throw new BadCredentialsException("CardDAV");
            }
            return UsernamePasswordAuthenticationToken.authenticated(account.get(), null, List.of());
        };
        return http.securityMatcher("/dav", "/dav/**", "/.well-known/carddav")
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .authenticationManager(manager)
                .httpBasic(basic -> basic.authenticationEntryPoint(unauthenticated))
                .authorizeHttpRequests(auth -> auth.requestMatchers("/.well-known/carddav")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(unauthenticated))
                .build();
    }

    @Bean
    WebSecurityCustomizer davMethods() {
        StrictHttpFirewall firewall = new StrictHttpFirewall();
        firewall.setAllowedHttpMethods(METHODS);
        return web -> web.httpFirewall(firewall);
    }
}
