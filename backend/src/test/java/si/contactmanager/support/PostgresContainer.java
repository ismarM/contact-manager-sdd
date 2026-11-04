package si.contactmanager.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** PostgreSQL prek Testcontainers (konstitucija II): en vsebnik za vse integracijske teste. */
public final class PostgresContainer {

    public static final String IMAGE = "postgres:18-alpine";

    private static final PostgreSQLContainer SHARED = newContainer();

    static {
        SHARED.start();
    }

    private PostgresContainer() {}

    /** Nov, še ne zagnan vsebnik – za teste, ki bazo ustavijo (npr. DatabaseDownIT). */
    public static PostgreSQLContainer newContainer() {
        return new PostgreSQLContainer(IMAGE)
                .withDatabaseName("contacts")
                .withUsername("contacts")
                .withPassword("contacts")
                .withStartupTimeout(java.time.Duration.ofSeconds(120));
    }

    public static PostgreSQLContainer shared() {
        return SHARED;
    }

    /** Za {@code @DynamicPropertySource}: nastavi spring.datasource.* na skupni vsebnik. */
    public static void register(DynamicPropertyRegistry registry) {
        register(registry, SHARED);
    }

    public static void register(DynamicPropertyRegistry registry, PostgreSQLContainer container) {
        registry.add("spring.datasource.url", container::getJdbcUrl);
        registry.add("spring.datasource.username", container::getUsername);
        registry.add("spring.datasource.password", container::getPassword);
    }
}
