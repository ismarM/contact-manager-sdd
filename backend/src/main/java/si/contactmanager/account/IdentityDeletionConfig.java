package si.contactmanager.account;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Nastavitve brisanja identitete (012). Planer in odjemalec Firebase pridejo z implementacijo. */
@Configuration
@EnableConfigurationProperties(IdentityDeletionProperties.class)
public class IdentityDeletionConfig {}
