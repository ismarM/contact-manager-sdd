package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import si.contactmanager.image.support.TestImages;

/**
 * Poraba pomnilnika pri obdelavi (FR-018-15, plan.md dopolnitev 3): otroški JVM z {@code -Xmx128m} hkrati obdela dve
 * sliki 4096 × 4096 (JPEG in PNG, nato prepleten PNG) brez {@code OutOfMemoryError}. Brez podvzorčenja bi ena sama
 * dekodirana slika zasedla ~64 MB.
 */
class ImageProcessorMemoryTest {

    @TempDir
    Path directory;

    private String run(Path... files) throws IOException, InterruptedException {
        Path classes = location(ImageProcessor.class);
        Path testClasses = location(MemoryProbe.class);
        List<String> command = new ArrayList<>(List.of(
                Paths.get(System.getProperty("java.home"), "bin", "java").toString(),
                "-Xmx128m",
                "-Djava.awt.headless=true",
                "-cp",
                classes + java.io.File.pathSeparator + testClasses,
                "si.contactmanager.image.MemoryProbe"));
        for (Path file : files) {
            command.add(file.toString());
        }
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        String output = new String(process.getInputStream().readAllBytes());
        assertThat(process.waitFor(120, TimeUnit.SECONDS))
                .as("otroški JVM je končal")
                .isTrue();
        assertThat(process.exitValue()).as(output).isZero();
        return output.trim();
    }

    private static Path location(Class<?> type) {
        try {
            return Paths.get(
                    type.getProtectionDomain().getCodeSource().getLocation().toURI());
        } catch (java.net.URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    private Path write(String name, byte[] data) throws IOException {
        return Files.write(directory.resolve(name), data);
    }

    @Test
    void twoLargeImagesAtOnceFitInAHeapOf128Megabytes() throws Exception {
        BufferedImage source = TestImages.quadrants(4096, 4096, BufferedImage.TYPE_INT_RGB);
        Path jpeg = write("a.jpg", TestImages.jpeg(source));
        Path png = write("b.png", TestImages.png(source, false));

        assertThat(run(jpeg, png)).isEqualTo("OK");
    }

    @Test
    void twoLargeInterlacedPngsAtOnceFitInAHeapOf128Megabytes() throws Exception {
        BufferedImage source = TestImages.quadrants(4096, 4096, BufferedImage.TYPE_INT_RGB);
        byte[] interlaced = TestImages.png(source, true);
        Path first = write("c.png", interlaced);
        Path second = write("d.png", interlaced);

        assertThat(run(first, second)).isEqualTo("OK");
    }
}
