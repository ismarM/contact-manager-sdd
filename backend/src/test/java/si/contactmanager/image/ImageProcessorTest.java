package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.image.ProcessedImage.Variant;
import si.contactmanager.image.support.TestImages;
import si.contactmanager.shared.error.RateLimitedException;

/**
 * Obdelava slik (FR-018-14, 15, 16): izhodne velikosti, vrste, orientacija z barvnimi vogali, odstranitev metapodatkov,
 * zloraba (lažni zapisi, okrnjene in poškodovane datoteke, meje velikosti) in omejitev pomnilnika s podvzorčenjem.
 */
class ImageProcessorTest {

    static final ImageProperties PROPERTIES =
            new ImageProperties(5_242_880, 4096, 16_800_000, 2048, 2, 5, 10, new ImageProperties.Google(List.of()));

    private final ImageProcessor processor = new ImageProcessor(PROPERTIES);

    private static BufferedImage decode(Variant variant) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(variant.data()));
    }

    private static boolean near(int rgb, Color expected) {
        Color actual = new Color(rgb);
        return Math.abs(actual.getRed() - expected.getRed()) < 40
                && Math.abs(actual.getGreen() - expected.getGreen()) < 40
                && Math.abs(actual.getBlue() - expected.getBlue()) < 40;
    }

    private static List<Integer> sizes(ProcessedImage image) {
        return image.variants().stream().map(Variant::size).toList();
    }

    private static Variant variant(ProcessedImage image, int size) {
        return image.variants().stream()
                .filter(v -> v.size() == size)
                .findFirst()
                .orElseThrow();
    }

    private static String code(byte[] data, ImageProcessor processor) {
        return assertThatThrownBy(() -> processor.process(data))
                .isInstanceOf(ImageRejectedException.class)
                .actual()
                .toString()
                .replace("si.contactmanager.image.ImageRejectedException: ", "");
    }

    // --- izhod ---

    @Test
    void largeJpegGivesThreeSquareJpegVariants() throws Exception {
        ProcessedImage result = processor.process(TestImages.jpeg(1000, 800));

        assertThat(sizes(result)).containsExactly(512, 256, 96);
        for (Variant variant : result.variants()) {
            assertThat(variant.contentType()).isEqualTo("image/jpeg");
            BufferedImage image = decode(variant);
            assertThat(image.getWidth()).isEqualTo(variant.size());
            assertThat(image.getHeight()).isEqualTo(variant.size());
        }
    }

    @Test
    void centreSquareIsKeptForNonSquareInput() throws Exception {
        ProcessedImage result = processor.process(TestImages.jpeg(800, 400));

        BufferedImage image = decode(variant(result, 256));
        // sredinski kvadrat 400 × 400 vsebuje desno polovico rdečega in levo polovico zelenega kvadranta
        assertThat(near(image.getRGB(64, 64), TestImages.RED)).isTrue();
        assertThat(near(image.getRGB(192, 64), TestImages.GREEN)).isTrue();
        assertThat(near(image.getRGB(64, 192), TestImages.BLUE)).isTrue();
        assertThat(near(image.getRGB(192, 192), TestImages.YELLOW)).isTrue();
    }

    @Test
    void smallImagesAreNeverUpscaled() throws Exception {
        assertThat(sizes(processor.process(TestImages.jpeg(300, 300)))).containsExactly(256, 96);
        assertThat(sizes(processor.process(TestImages.jpeg(200, 150)))).containsExactly(96);
        ProcessedImage tiny = processor.process(TestImages.png(64, 64));
        assertThat(sizes(tiny)).containsExactly(96);
        assertThat(decode(tiny.variants().get(0)).getWidth()).isEqualTo(64);
    }

    @Test
    void opaquePngBecomesJpegAndTransparentPngStaysPng() throws Exception {
        ProcessedImage opaque = processor.process(TestImages.png(600, 600));
        assertThat(opaque.variants())
                .allSatisfy(v -> assertThat(v.contentType()).isEqualTo("image/jpeg"));

        BufferedImage argb = TestImages.quadrants(600, 600, BufferedImage.TYPE_INT_ARGB);
        for (int x = 0; x < 300; x++) {
            for (int y = 0; y < 300; y++) {
                argb.setRGB(x, y, 0);
            }
        }
        ProcessedImage transparent = processor.process(TestImages.png(argb));
        assertThat(transparent.variants())
                .allSatisfy(v -> assertThat(v.contentType()).isEqualTo("image/png"));
        BufferedImage image = decode(variant(transparent, 256));
        assertThat(image.getColorModel().hasAlpha()).isTrue();
        assertThat(image.getRGB(20, 20) >>> 24).isZero();
        assertThat(image.getRGB(230, 230) >>> 24).isEqualTo(255);
    }

    @Test
    void pngWithAlphaChannelButFullyOpaquePixelsBecomesJpeg() {
        BufferedImage argb = TestImages.quadrants(300, 300, BufferedImage.TYPE_INT_ARGB);
        ProcessedImage result = processor.process(TestImages.png(argb));
        assertThat(result.variants())
                .allSatisfy(v -> assertThat(v.contentType()).isEqualTo("image/jpeg"));
    }

    @Test
    void grayscaleJpegKeepsItsBrightness() throws Exception {
        BufferedImage gray = new BufferedImage(300, 300, BufferedImage.TYPE_BYTE_GRAY);
        for (int x = 0; x < 300; x++) {
            for (int y = 0; y < 300; y++) {
                gray.getRaster().setSample(x, y, 0, 100);
            }
        }
        ProcessedImage result = processor.process(TestImages.jpeg(gray));
        Color pixel = new Color(decode(variant(result, 256)).getRGB(128, 128));
        assertThat(pixel.getRed()).isBetween(95, 105);
        assertThat(pixel.getGreen()).isBetween(95, 105);
    }

    @Test
    void streamIsReadWithTheSameRules() {
        ProcessedImage result = processor.process(new ByteArrayInputStream(TestImages.jpeg(300, 300)));
        assertThat(sizes(result)).containsExactly(256, 96);
        assertThat(code(new byte[0], processor)).isEqualTo("INVALID_IMAGE");
    }

    // --- orientacija ---

    private record Corners(Color topLeft, Color topRight, Color bottomLeft, Color bottomRight) {}

    private static Corners expectedCorners(int orientation) {
        Color r = TestImages.RED;
        Color g = TestImages.GREEN;
        Color b = TestImages.BLUE;
        Color y = TestImages.YELLOW;
        return switch (orientation) {
            case 1 -> new Corners(r, g, b, y);
            case 2 -> new Corners(g, r, y, b);
            case 3 -> new Corners(y, b, g, r);
            case 4 -> new Corners(b, y, r, g);
            case 5 -> new Corners(r, b, g, y);
            case 6 -> new Corners(b, r, y, g);
            case 7 -> new Corners(y, g, b, r);
            default -> new Corners(g, y, r, b);
        };
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4, 5, 6, 7, 8})
    void exifOrientationIsApplied(int orientation) throws Exception {
        // nekvadratna slika: orientacija in sredinski kvadrat sta neodvisna
        byte[] jpeg = TestImages.withOrientation(TestImages.jpeg(400, 300), orientation, orientation % 2 == 0);

        ProcessedImage result = processor.process(jpeg);

        BufferedImage image = decode(variant(result, 256));
        Corners expected = expectedCorners(orientation);
        assertThat(near(image.getRGB(40, 40), expected.topLeft()))
                .as("zgoraj levo")
                .isTrue();
        assertThat(near(image.getRGB(216, 40), expected.topRight()))
                .as("zgoraj desno")
                .isTrue();
        assertThat(near(image.getRGB(40, 216), expected.bottomLeft()))
                .as("spodaj levo")
                .isTrue();
        assertThat(near(image.getRGB(216, 216), expected.bottomRight()))
                .as("spodaj desno")
                .isTrue();
    }

    @Test
    void invalidExifMeansOrientationOne() throws Exception {
        byte[] jpeg = TestImages.withOrientation(TestImages.jpeg(300, 300), 9, true);
        BufferedImage image = decode(variant(processor.process(jpeg), 256));
        assertThat(near(image.getRGB(40, 40), TestImages.RED)).isTrue();
    }

    @Test
    void corruptedExifSegmentGivesAnImageOrInvalidImageButNoOtherException() {
        byte[] jpeg = TestImages.insertAfterSoi(
                TestImages.jpeg(300, 300),
                TestImages.segment(0xE1, new byte[] {'E', 'x', 'i', 'f', 0, 0, 'M', 'M', 0}));
        try {
            assertThat(sizes(processor.process(jpeg))).containsExactly(256, 96);
        } catch (ImageRejectedException e) {
            assertThat(e.code()).isEqualTo("INVALID_IMAGE");
        }
    }

    // --- metapodatki ---

    /** Veljaven profil sRGB v enem kosu APP2 (neveljaven profil bralnik JDK javi kot opozorilo). */
    private static byte[] iccSegmentData() {
        byte[] profile = java.awt.color.ICC_Profile.getInstance(java.awt.color.ColorSpace.CS_sRGB)
                .getData();
        byte[] header = "ICC_PROFILE\0\1\1".getBytes(StandardCharsets.ISO_8859_1);
        byte[] data = java.util.Arrays.copyOf(header, header.length + profile.length);
        System.arraycopy(profile, 0, data, header.length, profile.length);
        return data;
    }

    private static boolean contains(byte[] data, String text) {
        return new String(data, StandardCharsets.ISO_8859_1).contains(text);
    }

    @Test
    void outputHasNoExifGpsXmpIccOrComments() {
        byte[] source = TestImages.insertAfterSoi(
                TestImages.jpeg(600, 600),
                TestImages.exifSegment(1, true, "GPSLatitude=46.05 SecretPlace"),
                TestImages.segment(0xE1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>XmpSecret</x:xmpmeta>".getBytes()),
                TestImages.segment(0xE2, iccSegmentData()),
                TestImages.segment(0xFE, "KomentarSecret".getBytes()));
        assertThat(contains(source, "GPSLatitude")).isTrue();

        for (Variant variant : processor.process(source).variants()) {
            for (String text : List.of(
                    "Exif",
                    "GPS",
                    "SecretPlace",
                    "xmpmeta",
                    "XmpSecret",
                    "ICC_PROFILE",
                    "IccSecret",
                    "KomentarSecret")) {
                assertThat(contains(variant.data(), text))
                        .as(text + " v " + variant.size())
                        .isFalse();
            }
        }
    }

    @Test
    void pngTextChunksAreNotCarriedOver() throws Exception {
        byte[] png = TestImages.png(TestImages.quadrants(300, 300, BufferedImage.TYPE_INT_ARGB), false);
        // tEXt delček za IHDR z besedilom, ki se v izhodu ne sme pojaviti
        byte[] withText = insertPngText(png, "Comment", "PngSecret");
        assertThat(contains(withText, "PngSecret")).isTrue();
        BufferedImage argb = TestImages.quadrants(300, 300, BufferedImage.TYPE_INT_ARGB);
        argb.setRGB(0, 0, 0);
        byte[] transparent = insertPngText(TestImages.png(argb), "Comment", "PngSecret");

        for (byte[] input : List.of(withText, transparent)) {
            for (Variant variant : processor.process(input).variants()) {
                assertThat(contains(variant.data(), "PngSecret")).isFalse();
                assertThat(contains(variant.data(), "tEXt")).isFalse();
            }
        }
    }

    private static byte[] insertPngText(byte[] png, String key, String value) {
        byte[] data = (key + "\0" + value).getBytes(StandardCharsets.ISO_8859_1);
        java.io.ByteArrayOutputStream chunk = new java.io.ByteArrayOutputStream();
        int length = data.length;
        chunk.writeBytes(
                new byte[] {(byte) (length >>> 24), (byte) (length >>> 16), (byte) (length >>> 8), (byte) length});
        byte[] type = "tEXt".getBytes(StandardCharsets.US_ASCII);
        chunk.writeBytes(type);
        chunk.writeBytes(data);
        java.util.zip.CRC32 crc = new java.util.zip.CRC32();
        crc.update(type);
        crc.update(data);
        long value32 = crc.getValue();
        chunk.writeBytes(
                new byte[] {(byte) (value32 >>> 24), (byte) (value32 >>> 16), (byte) (value32 >>> 8), (byte) value32});
        int afterIhdr = 8 + 12 + 13; // podpis + dolžina/vrsta/CRC (12) + vsebina IHDR (13)
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        out.write(png, 0, afterIhdr);
        out.writeBytes(chunk.toByteArray());
        out.write(png, afterIhdr, png.length - afterIhdr);
        return out.toByteArray();
    }

    // --- zloraba ---

    @Test
    void foreignFormatsAreRejectedRegardlessOfNameOrDeclaredType() {
        List<byte[]> files = new ArrayList<>();
        files.add("MZ\u0090\u0000\u0003\u0000\u0000\u0000".getBytes(StandardCharsets.ISO_8859_1)); // EXE
        files.add("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes());
        files.add("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;".getBytes(StandardCharsets.ISO_8859_1));
        files.add("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ".getBytes(StandardCharsets.ISO_8859_1));
        files.add("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n".getBytes());
        files.add("<?xml version=\"1.0\"?><svg/>".getBytes());
        for (byte[] file : files) {
            assertThat(code(file, processor)).isEqualTo("INVALID_IMAGE");
        }
    }

    @Test
    void emptyAndGarbageFilesAreRejected() {
        assertThat(code(new byte[0], processor)).isEqualTo("INVALID_IMAGE");
        assertThat(code(new byte[] {(byte) 0xFF}, processor)).isEqualTo("INVALID_IMAGE");
        assertThat(code(new byte[100], processor)).isEqualTo("INVALID_IMAGE");
    }

    @Test
    void truncatedJpegAndPngAreRejected() {
        byte[] jpeg = TestImages.jpeg(600, 600);
        byte[] png = TestImages.png(TestImages.quadrants(600, 600, BufferedImage.TYPE_INT_RGB), false);
        for (double fraction : new double[] {0.05, 0.3, 0.6, 0.9}) {
            assertThat(code(TestImages.truncate(jpeg, fraction), processor))
                    .as("JPEG " + fraction)
                    .isEqualTo("INVALID_IMAGE");
            assertThat(code(TestImages.truncate(png, fraction), processor))
                    .as("PNG " + fraction)
                    .isEqualTo("INVALID_IMAGE");
        }
    }

    @Test
    void wrongHeadersAreRejected() {
        byte[] jpeg = TestImages.jpeg(100, 100);
        byte[] png = TestImages.png(100, 100);
        byte[] jpegMagicOnly = new byte[200];
        jpegMagicOnly[0] = (byte) 0xFF;
        jpegMagicOnly[1] = (byte) 0xD8;
        jpegMagicOnly[2] = (byte) 0xFF;
        byte[] pngMagicOnly = new byte[200];
        System.arraycopy(png, 0, pngMagicOnly, 0, 8);
        byte[] flipped = jpeg.clone();
        flipped[0] = 0x00; // pokvarjen SOI
        byte[] pngBadChunk = png.clone();
        pngBadChunk[12] = 'X'; // IHDR → XHDR
        for (byte[] file : List.of(jpegMagicOnly, pngMagicOnly, flipped, pngBadChunk)) {
            assertThat(code(file, processor)).isEqualTo("INVALID_IMAGE");
        }
    }

    @Test
    void cmykJpegIsRejected() throws Exception {
        assertThat(code(cmykJpeg(), processor)).isEqualTo("INVALID_IMAGE");
    }

    private static byte[] cmykJpeg() throws IOException {
        java.awt.image.WritableRaster raster =
                java.awt.image.Raster.createInterleavedRaster(java.awt.image.DataBuffer.TYPE_BYTE, 64, 64, 4, null);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageWriter writer =
                ImageIO.getImageWritersByFormatName("jpeg").next();
        try (javax.imageio.stream.MemoryCacheImageOutputStream stream =
                new javax.imageio.stream.MemoryCacheImageOutputStream(out)) {
            writer.setOutput(stream);
            writer.write(null, new javax.imageio.IIOImage(raster, null, null), null);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    @Test
    void fileOverFiveMegabytesIsFileTooLarge() {
        byte[] big = new byte[5 * 1024 * 1024 + 1];
        big[0] = (byte) 0xFF;
        big[1] = (byte) 0xD8;
        big[2] = (byte) 0xFF;
        assertThat(code(big, processor)).isEqualTo("FILE_TOO_LARGE");
        assertThatThrownBy(() -> processor.process(new ByteArrayInputStream(big)))
                .isInstanceOf(ImageRejectedException.class)
                .hasMessage("FILE_TOO_LARGE");
    }

    @Test
    void dimensionsAreCheckedFromTheHeaderBeforeDecoding() {
        assertThat(code(TestImages.png(TestImages.quadrants(4097, 100, BufferedImage.TYPE_INT_RGB)), processor))
                .isEqualTo("IMAGE_TOO_LARGE");
        assertThat(code(TestImages.pngHeaderOnly(10_000, 10_000), processor)).isEqualTo("IMAGE_TOO_LARGE");
        assertThat(code(TestImages.jpegHeaderOnly(10_000, 10_000), processor)).isEqualTo("IMAGE_TOO_LARGE");
        assertThat(code(TestImages.pngHeaderOnly(100, 4097), processor)).isEqualTo("IMAGE_TOO_LARGE");
        assertThat(code(TestImages.pngHeaderOnly(0, 100), processor)).isEqualTo("INVALID_IMAGE");
    }

    @Test
    void imageExactlyAtTheLimitIsAccepted() {
        ProcessedImage result =
                processor.process(TestImages.png(TestImages.quadrants(4096, 64, BufferedImage.TYPE_INT_RGB)));
        assertThat(sizes(result)).containsExactly(96);
    }

    @Test
    void pngBombWithLyingHeaderIsRejectedOrHarmlessWithoutLeakingExceptions() {
        byte[] bomb = TestImages.pngBomb(64, 64, 200 * 1024 * 1024);
        assertThat(bomb.length).isLessThan(5 * 1024 * 1024);
        long start = System.nanoTime();
        try {
            ProcessedImage result = processor.process(bomb);
            assertThat(sizes(result)).containsExactly(96); // odvečni podatki so prezrti, slika ostane 64 × 64
        } catch (ImageRejectedException e) {
            assertThat(e.code()).isEqualTo("INVALID_IMAGE");
        }
        assertThat((System.nanoTime() - start) / 1_000_000).as("ms").isLessThan(5_000);
    }

    // --- sočasnost ---

    @Test
    void busyProcessorAnswersRateLimitedInsteadOfWaitingForever() {
        ImageProperties noWait =
                new ImageProperties(5_242_880, 4096, 16_800_000, 2048, 1, 0, 10, new ImageProperties.Google(List.of()));
        ImageProcessor busy = new ImageProcessor(noWait, new Semaphore(0));

        assertThatThrownBy(() -> busy.process(TestImages.jpeg(300, 300))).isInstanceOf(RateLimitedException.class);
        // neveljavna datoteka se zavrne, še preden se čaka na dovoljenje
        assertThatThrownBy(() -> busy.process(new byte[10])).isInstanceOf(ImageRejectedException.class);
    }

    // --- pomnilnik: podvzorčenje ---

    @ParameterizedTest
    @ValueSource(strings = {"jpeg", "png", "png-interlaced"})
    void decodedImageNeverExceeds2048Points(String kind) {
        BufferedImage source = TestImages.quadrants(4096, 4096, BufferedImage.TYPE_INT_RGB);
        byte[] data = switch (kind) {
            case "jpeg" -> TestImages.jpeg(source);
            case "png" -> TestImages.png(source, false);
            default -> TestImages.png(source, true);
        };
        AtomicInteger width = new AtomicInteger();
        AtomicInteger height = new AtomicInteger();
        ImageProcessor observed = new ImageProcessor(PROPERTIES);
        observed.observeDecoded(decoded -> {
            width.set(decoded.getWidth());
            height.set(decoded.getHeight());
        });

        ProcessedImage result = observed.process(data);

        assertThat(width.get()).isBetween(1, 2048);
        assertThat(height.get()).isBetween(1, 2048);
        assertThat(sizes(result)).containsExactly(512, 256, 96);
    }

    @Test
    void subsamplingFactorIsCeilingOfLongerSideOver2048() {
        AtomicInteger width = new AtomicInteger();
        ImageProcessor observed = new ImageProcessor(PROPERTIES);
        observed.observeDecoded(decoded -> width.set(decoded.getWidth()));

        observed.process(TestImages.jpeg(2049, 100));
        assertThat(width.get()).isEqualTo(1025); // faktor 2
        observed.process(TestImages.jpeg(2048, 100));
        assertThat(width.get()).isEqualTo(2048); // faktor 1
        observed.process(TestImages.png(TestImages.quadrants(3000, 100, BufferedImage.TYPE_INT_RGB)));
        assertThat(width.get()).isEqualTo(1500); // faktor 2
    }
}
