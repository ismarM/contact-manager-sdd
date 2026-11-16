package si.contactmanager.maps;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Nastavitve kartografskega posrednika (016): vezava {@link MapsProperties}. */
@Configuration
@EnableConfigurationProperties(MapsProperties.class)
public class MapsConfig {}
