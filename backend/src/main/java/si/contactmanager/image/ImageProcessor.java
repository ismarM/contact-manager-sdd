package si.contactmanager.image;

import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.IndexColorModel;
import java.awt.image.Raster;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import si.contactmanager.shared.error.RateLimitedException;

/**
 * Varna obdelava slike (research R-02, R-03, R-04): meje velikosti in mer pred dekodiranjem, dekodiranje z
 * podvzorčenjem (največ {@code decodeSide} točk), omejena sočasnost, orientacija EXIF, sredinski kvadrat, tri velikosti
 * in ponovno kodiranje (JPEG, PNG pri prosojnosti) brez metapodatkov. Vse izjeme dekodiranja so {@code INVALID_IMAGE}.
 */
@Component
public class ImageProcessor {

    static final int[] SIZES = {512, 256, 96};
    private static final float JPEG_QUALITY = 0.85f;

    private final ImageProperties properties;
    private final Semaphore permits;

    static {
        ImageIO.setUseCache(false); // brez začasnih datotek
        System.setProperty("java.awt.headless", "true");
    }

    /** Opazovalec dekodirane slike (samo za teste porabe pomnilnika: preveri, da podvzorčenje omeji velikost). */
    private volatile Consumer<BufferedImage> decodedObserver = decoded -> {};

    @Autowired
    ImageProcessor(ImageProperties properties) {
        this(properties, new Semaphore(properties.concurrent(), true));
    }

    ImageProcessor(ImageProperties properties, Semaphore permits) {
        this.properties = properties;
        this.permits = permits;
    }

    void observeDecoded(Consumer<BufferedImage> observer) {
        this.decodedObserver = observer;
    }

    /** Obdela sliko iz toka; bere največ {@code maxBytes + 1} bajtov ({@code FILE_TOO_LARGE} ob preseganju). */
    public ProcessedImage process(InputStream in) {
        byte[] bytes;
        try {
            bytes = in.readNBytes((int) properties.maxBytes() + 1);
        } catch (IOException e) {
            throw new ImageRejectedException("INVALID_IMAGE");
        }
        return process(bytes);
    }

    /** Obdela sliko; {@link ImageRejectedException} pri neveljavni, preveliki ali poškodovani datoteki. */
    public ProcessedImage process(byte[] bytes) {
        if (bytes.length > properties.maxBytes()) {
            throw new ImageRejectedException("FILE_TOO_LARGE");
        }
        boolean jpeg = startsWith(bytes, 0xFF, 0xD8, 0xFF);
        boolean png = startsWith(bytes, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
        if (!jpeg && !png) {
            throw new ImageRejectedException("INVALID_IMAGE");
        }
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (input == null) {
                throw new ImageRejectedException("INVALID_IMAGE");
            }
            Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(jpeg ? "jpeg" : "png");
            if (!readers.hasNext()) {
                throw new ImageRejectedException("INVALID_IMAGE");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1) {
                    throw new ImageRejectedException("INVALID_IMAGE");
                }
                if (width > properties.maxSide()
                        || height > properties.maxSide()
                        || (long) width * height > properties.maxPixels()) {
                    throw new ImageRejectedException("IMAGE_TOO_LARGE");
                }
                if (jpeg && jpegComponents(bytes) == 4) {
                    throw new ImageRejectedException("INVALID_IMAGE"); // CMYK/YCCK: ni podprto
                }
                return decodeAndEncode(reader, bytes, jpeg, width, height);
            } finally {
                reader.dispose();
            }
        } catch (ImageRejectedException | RateLimitedException e) {
            throw e;
        } catch (IOException | RuntimeException | OutOfMemoryError e) {
            // OutOfMemoryError je zavestno ujet: presežena meja pomnilnika pomeni zavrnitev slike, ne okvare strežnika
            throw new ImageRejectedException("INVALID_IMAGE");
        }
    }

    private ProcessedImage decodeAndEncode(ImageReader reader, byte[] bytes, boolean jpeg, int width, int height)
            throws IOException {
        acquire();
        try {
            int factor = Math.max(1, (int) Math.ceil(Math.max(width, height) / (double) properties.decodeSide()));
            ImageReadParam param = reader.getDefaultReadParam();
            param.setSourceSubsampling(factor, factor, 0, 0);
            AtomicBoolean warned = new AtomicBoolean();
            reader.addIIOReadWarningListener((source, warning) -> warned.set(true));
            BufferedImage decoded = reader.read(0, param);
            if (jpeg && warned.get()) {
                throw new ImageRejectedException("INVALID_IMAGE"); // okrnjen ali poškodovan tok
            }
            decodedObserver.accept(decoded);
            int orientation = jpeg ? ExifOrientation.read(bytes) : 1;
            return encode(decoded, orientation);
        } finally {
            permits.release();
        }
    }

    private void acquire() {
        try {
            if (!permits.tryAcquire(properties.waitSeconds(), TimeUnit.SECONDS)) {
                throw new RateLimitedException();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RateLimitedException();
        }
    }

    private static ProcessedImage encode(BufferedImage decoded, int orientation) throws IOException {
        boolean alpha = decoded.getColorModel().hasAlpha();
        int w = decoded.getWidth();
        int h = decoded.getHeight();
        int side = Math.min(w, h);
        BufferedImage square = decoded.getSubimage((w - side) / 2, (h - side) / 2, side, side);
        if (isGray(decoded.getColorModel())) {
            square = grayToRgb(square, alpha);
        }
        BufferedImage base = orient(scale(square, Math.min(side, SIZES[0]), alpha), orientation);
        boolean transparent = alpha && hasTransparentPixel(base);
        List<ProcessedImage.Variant> variants = new ArrayList<>();
        int baseSize = base.getWidth();
        for (int size : SIZES) {
            if (size <= baseSize) {
                variants.add(variant(size, size == baseSize ? base : scale(base, size, transparent), transparent));
            }
        }
        if (baseSize < 96) {
            variants.add(variant(96, base, transparent)); // nikoli povečava: manjša slika ostane izvirne velikosti
        }
        return new ProcessedImage(variants);
    }

    /** Število komponent iz prvega segmenta SOF (0xC0–0xCF razen DHT/JPG/DAC), sicer 0. */
    private static int jpegComponents(byte[] bytes) {
        int i = 2;
        while (i + 9 < bytes.length) {
            if ((bytes[i] & 0xFF) != 0xFF) {
                return 0;
            }
            int marker = bytes[i + 1] & 0xFF;
            if (marker == 0xFF) {
                i++;
                continue;
            }
            if (marker == 0xDA || marker == 0xD9) {
                return 0;
            }
            int length = ((bytes[i + 2] & 0xFF) << 8) | (bytes[i + 3] & 0xFF);
            if (marker >= 0xC0 && marker <= 0xCF && marker != 0xC4 && marker != 0xC8 && marker != 0xCC) {
                return bytes[i + 9] & 0xFF;
            }
            i += 2 + length;
        }
        return 0;
    }

    private static boolean isGray(ColorModel model) {
        return model.getNumColorComponents() == 1 && !(model instanceof IndexColorModel);
    }

    /** Sivinska slika se prepiše po vzorcih: risanje v RGB bi vrednosti zaradi linearnega sivinskega prostora posvetlilo. */
    private static BufferedImage grayToRgb(BufferedImage gray, boolean alpha) {
        Raster raster = gray.getRaster();
        ColorModel model = gray.getColorModel();
        int bits = model.getComponentSize(0);
        int max = (1 << bits) - 1;
        int alphaMax = alpha ? (1 << model.getComponentSize(model.getNumComponents() - 1)) - 1 : 1;
        int w = gray.getWidth();
        int h = gray.getHeight();
        BufferedImage out = new BufferedImage(w, h, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        int[] sample = new int[raster.getNumBands()];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                raster.getPixel(x, y, sample);
                int v = sample[0] * 255 / max;
                int a = alpha ? sample[sample.length - 1] * 255 / alphaMax : 255;
                out.setRGB(x, y, (a << 24) | (v << 16) | (v << 8) | v);
            }
        }
        return out;
    }

    private static boolean hasTransparentPixel(BufferedImage image) {
        int w = image.getWidth();
        int[] row = new int[w];
        for (int y = 0; y < image.getHeight(); y++) {
            image.getRGB(0, y, w, 1, row, 0, w);
            for (int argb : row) {
                if ((argb >>> 24) != 0xFF) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Pomanjšanje v korakih po polovico (boljša kakovost od enega skoka); nikoli povečava. */
    private static BufferedImage scale(BufferedImage source, int target, boolean alpha) {
        int type = alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage current = source;
        int size = source.getWidth();
        if (size == target && current.getType() == type) {
            return current;
        }
        do {
            int next = Math.max(target, size / 2);
            BufferedImage out = new BufferedImage(next, next, type);
            Graphics2D g = out.createGraphics();
            try {
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                g.drawImage(current, 0, 0, next, next, null);
            } finally {
                g.dispose();
            }
            current = out;
            size = next;
        } while (size > target);
        return current;
    }

    /** Orientacija EXIF 1–8 na kvadratni sliki. */
    private static BufferedImage orient(BufferedImage src, int orientation) {
        if (orientation == 1) {
            return src;
        }
        int n = src.getWidth();
        BufferedImage out = new BufferedImage(n, n, src.getType());
        for (int y = 0; y < n; y++) {
            for (int x = 0; x < n; x++) {
                int sx;
                int sy;
                switch (orientation) {
                    case 2 -> {
                        sx = n - 1 - x;
                        sy = y;
                    }
                    case 3 -> {
                        sx = n - 1 - x;
                        sy = n - 1 - y;
                    }
                    case 4 -> {
                        sx = x;
                        sy = n - 1 - y;
                    }
                    case 5 -> {
                        sx = y;
                        sy = x;
                    }
                    case 6 -> {
                        sx = y;
                        sy = n - 1 - x;
                    }
                    case 7 -> {
                        sx = n - 1 - y;
                        sy = n - 1 - x;
                    }
                    default -> {
                        sx = n - 1 - y;
                        sy = x;
                    }
                }
                out.setRGB(x, y, src.getRGB(sx, sy));
            }
        }
        return out;
    }

    private static ProcessedImage.Variant variant(int size, BufferedImage image, boolean png) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (png) {
            BufferedImage argb = image.getType() == BufferedImage.TYPE_INT_ARGB ? image : copy(image, true);
            if (!ImageIO.write(argb, "png", out)) {
                throw new IOException("ni pisalca PNG");
            }
            return new ProcessedImage.Variant(size, "image/png", out.toByteArray());
        }
        BufferedImage rgb = image.getType() == BufferedImage.TYPE_INT_RGB ? image : copy(image, false);
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.setOutput(stream);
            writer.write(null, new IIOImage(rgb, null, null), param); // brez metapodatkov (EXIF, GPS, ICC, XMP)
        } finally {
            writer.dispose();
        }
        return new ProcessedImage.Variant(size, "image/jpeg", out.toByteArray());
    }

    private static BufferedImage copy(BufferedImage src, boolean alpha) {
        BufferedImage out = new BufferedImage(
                src.getWidth(), src.getHeight(), alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.drawImage(src, 0, 0, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static boolean startsWith(byte[] data, int... prefix) {
        if (data.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if ((data[i] & 0xFF) != prefix[i]) {
                return false;
            }
        }
        return true;
    }
}
