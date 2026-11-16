package si.contactmanager.apikey;

import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Tabela {@code api_key} (019 data-model.md); vsaka poizvedba je vezana na id ključa in lastnika. */
@Repository
class ApiKeyRepository {

    private final JdbcClient jdbc;

    ApiKeyRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ime veljavnega ključa za prijavo na {@code /v1}: vrstica obstaja, pripada uporabniku {@code user} in ni preklicana.
     * Rok preveri že podpis žetona ({@code exp}).
     */
    Optional<String> activeKeyName(UUID keyId, long user) {
        return jdbc.sql("SELECT name FROM api_key WHERE id = :id AND user_id = :user AND revoked_at IS NULL")
                .param("id", keyId)
                .param("user", user)
                .query(String.class)
                .optional();
    }
}
