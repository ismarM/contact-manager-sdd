package si.contactmanager.image.support;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * Slike za teste, ustvarjene programsko (brez datotek): JPEG in PNG z znanimi barvnimi vogali, orientacija EXIF, okrnjene
 * in zlonamerne datoteke. Barve vogalov: zgoraj levo rdeča, zgoraj desno zelena, spodaj levo modra, spodaj desno rumena.
 */
public final class TestImages {

    public static final Color RED = new Color(220, 20, 20);
    public static final Color GREEN = new Color(20, 200, 20);
    public static final Color BLUE = new Color(20, 20, 220);
    public static final Color YELLOW = new Color(230, 230, 20);

    private TestImages() {}

    /** Slika s štirimi enobarvnimi kvadranti. */
    public static BufferedImage quadrants(int width, int height, int type) {
        BufferedImage image = new BufferedImage(width, height, type);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(RED);
            g.fillRect(0, 0, width / 2, height / 2);
            g.setColor(GREEN);
            g.fillRect(width / 2, 0, width - width / 2, height / 2);
            g.setColor(BLUE);
            g.fillRect(0, height / 2, width / 2, height - height / 2);
            g.setColor(YELLOW);
            g.fillRect(width / 2, height / 2, width - width / 2, height - height / 2);
        } finally {
            g.dispose();
        }
        return image;
    }

    public static byte[] jpeg(BufferedImage image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(image, "jpeg", out)) {
                throw new IllegalStateException("ni pisalca JPEG");
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    public static byte[] png(BufferedImage image) {
        return png(image, false);
    }

    public static byte[] png(BufferedImage image, boolean interlaced) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("png").next();
        try (MemoryCacheImageOutputStream stream = new MemoryCacheImageOutputStream(out)) {
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setProgressiveMode(interlaced ? ImageWriteParam.MODE_DEFAULT : ImageWriteParam.MODE_DISABLED);
            writer.setOutput(stream);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    /** JPEG s štirimi kvadranti v dani velikosti. */
    public static byte[] jpeg(int width, int height) {
        return jpeg(quadrants(width, height, BufferedImage.TYPE_INT_RGB));
    }

    /** PNG s štirimi kvadranti v dani velikosti. */
    public static byte[] png(int width, int height) {
        return png(quadrants(width, height, BufferedImage.TYPE_INT_RGB));
    }

    /** JPEG z vstavljenim segmentom APP1 (EXIF) z orientacijo, takoj za SOI. */
    public static byte[] withOrientation(byte[] jpeg, int orientation, boolean littleEndian) {
        return insertAfterSoi(jpeg, exifSegment(orientation, littleEndian, null));
    }

    /** Segment APP1 z oznako orientacije (in neobveznim besedilom GPS, ki se v izhodu ne sme pojaviti). */
    public static byte[] exifSegment(int orientation, boolean little, String extraText) {
        ByteArrayOutputStream tiff = new ByteArrayOutputStream();
        tiff.writeBytes(little ? new byte[] {'I', 'I'} : new byte[] {'M', 'M'});
        put16(tiff, 0x002A, little);
        put32(tiff, 8, little);
        put16(tiff, 1, little);
        put16(tiff, 0x0112, little);
        put16(tiff, 3, little);
        put32(tiff, 1, little);
        put16(tiff, orientation, little);
        put16(tiff, 0, little);
        put32(tiff, 0, little);
        if (extraText != null) {
            tiff.writeBytes(extraText.getBytes(StandardCharsets.US_ASCII));
        }
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        payload.writeBytes(new byte[] {'E', 'x', 'i', 'f', 0, 0});
        payload.writeBytes(tiff.toByteArray());
        return segment(0xE1, payload.toByteArray());
    }

    /** Segment JPEG: {@code FF marker} + dolžina + vsebina. */
    public static byte[] segment(int marker, byte[] payload) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xFF);
        out.write(marker);
        out.write((payload.length + 2) >> 8);
        out.write((payload.length + 2) & 0xFF);
        out.writeBytes(payload);
        return out.toByteArray();
    }

    /** Vstavi segmente takoj za začetnim SOI. */
    public static byte[] insertAfterSoi(byte[] jpeg, byte[]... segments) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        for (byte[] segment : segments) {
            out.writeBytes(segment);
        }
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }

    public static byte[] truncate(byte[] data, double fraction) {
        return java.util.Arrays.copyOf(data, (int) (data.length * fraction));
    }

    /** PNG, ki v glavi IHDR navaja dano velikost; podatki so le nekaj bajtov (glava se prebere pred dekodiranjem). */
    public static byte[] pngHeaderOnly(int width, int height) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        put32(ihdr, width, false);
        put32(ihdr, height, false);
        ihdr.writeBytes(new byte[] {8, 2, 0, 0, 0});
        chunk(out, "IHDR", ihdr.toByteArray());
        chunk(out, "IDAT", new byte[] {0x78, 0x01, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01});
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    /** PNG, ki navaja majhno sliko, a vsebuje zlib tok z {@code expandedBytes} ničel (»bomba«). */
    public static byte[] pngBomb(int width, int height, int expandedBytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        ByteArrayOutputStream ihdr = new ByteArrayOutputStream();
        put32(ihdr, width, false);
        put32(ihdr, height, false);
        ihdr.writeBytes(new byte[] {8, 2, 0, 0, 0});
        chunk(out, "IHDR", ihdr.toByteArray());
        ByteArrayOutputStream zlib = new ByteArrayOutputStream();
        try (DeflaterOutputStream deflate = new DeflaterOutputStream(zlib)) {
            byte[] zeros = new byte[64 * 1024];
            for (int written = 0; written < expandedBytes; written += zeros.length) {
                deflate.write(zeros);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        chunk(out, "IDAT", zlib.toByteArray());
        chunk(out, "IEND", new byte[0]);
        return out.toByteArray();
    }

    /** JPEG z glavo SOF0, ki navaja dano velikost (brez podatkov slike). */
    public static byte[] jpegHeaderOnly(int width, int height) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[] {(byte) 0xFF, (byte) 0xD8});
        ByteArrayOutputStream sof = new ByteArrayOutputStream();
        sof.write(8);
        put16(sof, height, false);
        put16(sof, width, false);
        sof.write(3);
        for (int c = 1; c <= 3; c++) {
            sof.writeBytes(new byte[] {(byte) c, 0x11, 0});
        }
        out.writeBytes(segment(0xC0, sof.toByteArray()));
        // SOS (brez podatkov): bralnik JDK brez njega javi »missing SOS marker« že pri branju mer
        out.writeBytes(segment(0xDA, new byte[] {3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0}));
        out.writeBytes(new byte[] {(byte) 0xFF, (byte) 0xD9});
        return out.toByteArray();
    }

    private static void chunk(ByteArrayOutputStream out, String type, byte[] data) {
        put32(out, data.length, false);
        byte[] typeBytes = type.getBytes(StandardCharsets.US_ASCII);
        out.writeBytes(typeBytes);
        out.writeBytes(data);
        CRC32 crc = new CRC32();
        crc.update(typeBytes);
        crc.update(data);
        put32(out, (int) crc.getValue(), false);
    }

    private static void put16(ByteArrayOutputStream out, int value, boolean little) {
        if (little) {
            out.write(value & 0xFF);
            out.write((value >> 8) & 0xFF);
        } else {
            out.write((value >> 8) & 0xFF);
            out.write(value & 0xFF);
        }
    }

    private static void put32(ByteArrayOutputStream out, int value, boolean little) {
        if (little) {
            put16(out, value & 0xFFFF, true);
            put16(out, (value >>> 16) & 0xFFFF, true);
        } else {
            put16(out, (value >>> 16) & 0xFFFF, false);
            put16(out, value & 0xFFFF, false);
        }
    }
}
