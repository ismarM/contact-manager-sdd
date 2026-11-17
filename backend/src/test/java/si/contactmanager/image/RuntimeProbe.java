package si.contactmanager.image;

import java.util.List;
import si.contactmanager.image.support.TestImages;

/**
 * Glavni program za {@code ImageRuntimeIT}: v pravem izvajalnem okolju (JRE 21 na Alpine) pretvori JPEG in PNG 64 × 64
 * z istim {@link ImageProcessor} kot strežnik in izpiše povzetek ({@code OK jpeg=… png=…}); vsaka napaka je izhod ≠ 0.
 */
final class RuntimeProbe {

    private RuntimeProbe() {}

    public static void main(String[] args) {
        ImageProcessor processor = new ImageProcessor(new ImageProperties(
                5_242_880, 4096, 16_800_000, 2048, 2, 5, 10, new ImageProperties.Google(List.of())));
        ProcessedImage jpeg = processor.process(TestImages.jpeg(64, 64));
        ProcessedImage png = processor.process(TestImages.png(64, 64));
        System.out.println("OK jpeg=" + describe(jpeg) + " png=" + describe(png));
    }

    private static String describe(ProcessedImage image) {
        StringBuilder text = new StringBuilder();
        for (ProcessedImage.Variant variant : image.variants()) {
            text.append(variant.size())
                    .append(':')
                    .append(variant.contentType())
                    .append(':')
                    .append(variant.data().length)
                    .append(' ');
        }
        return text.toString().trim();
    }
}
