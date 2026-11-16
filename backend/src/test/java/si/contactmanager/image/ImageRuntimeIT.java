package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.MountableFile;

/**
 * ImageIO v izvajalnem okolju strežnika (FR-018-14, research R-03, naloga T001): v {@code eclipse-temurin:21-jre-alpine}
 * (osnova {@code backend/Dockerfile}) se JPEG in PNG 64 × 64 obdelata z istim {@link ImageProcessor}; brez sistemskih
 * knjižnic za pisave ali slike. Vsebnik teče kot nekorenski uporabnik, kot v produkciji.
 */
@Tag("FR-018-14")
class ImageRuntimeIT {

    private static final String JRE = "eclipse-temurin:21-jre-alpine";

    private static Path location(Class<?> type) {
        try {
            return Paths.get(
                    type.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (java.net.URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void jpegAndPngAreConvertedInTheServerRuntimeImage() {
        try (GenericContainer<?> jre = new GenericContainer<>(JRE)
                .withCopyFileToContainer(MountableFile.forHostPath(location(ImageProcessor.class)), "/probe/classes")
                .withCopyFileToContainer(MountableFile.forHostPath(location(RuntimeProbe.class)), "/probe/test-classes")
                .withCreateContainerCmdModifier(cmd -> cmd.withUser("1000:1000")
                        .withEntrypoint(
                                "java",
                                "-cp",
                                "/probe/classes:/probe/test-classes",
                                "si.contactmanager.image.RuntimeProbe"))
                .withStartupCheckStrategy(new org.testcontainers.containers.startupcheck.OneShotStartupCheckStrategy()
                        .withTimeout(Duration.ofSeconds(120)))) {
            jre.start();

            String output = jre.getLogs();
            // 64 × 64 ni nikoli povečan: nastane samo najmanjša različica, JPEG tudi iz neprosojnega PNG
            assertThat(output).startsWith("OK jpeg=96:image/jpeg:").contains(" png=96:image/jpeg:");
            assertThat(output).doesNotContain("Exception").doesNotContain("Error");
        }
    }
}
