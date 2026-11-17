package si.contactmanager.image;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Configuration;

/** Nastavitve slik (018, plan.md – Technical Context; research R-03, R-06, R-09). */
@ConfigurationProperties("images")
public record ImageProperties(
        @DefaultValue("5242880") long maxBytes,
        @DefaultValue("4096") int maxSide,
        @DefaultValue("16800000") long maxPixels,
        @DefaultValue("2048") int decodeSide,
        @DefaultValue("2") int concurrent,
        @DefaultValue("5") int waitSeconds,
        @DefaultValue("10") int uploadPerMinute,
        @DefaultValue Google google) {

    /** Dovoljeni gostitelji slike Google računa (regularni izrazi). */
    public record Google(
            @DefaultValue("^lh[0-9]+\\.googleusercontent\\.com$")
            List<String> allowedHosts) {}

    /** Vključitev nastavitev (paket nima drugih konfiguracij). */
    @Configuration
    @EnableConfigurationProperties(ImageProperties.class)
    static class Config {}
}
