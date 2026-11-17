package si.contactmanager.image;

/**
 * Najmanjši razčlenjevalnik EXIF (research R-04): samo oznaka orientacije 0x0112 iz segmenta APP1 v prvih 64 KB
 * JPEG-a, obe vrstni redi bajtov. Vse neveljavno ali manjkajoče pomeni orientacijo 1; izjeme ne uhajajo.
 */
final class ExifOrientation {

    private static final int SCAN_LIMIT = 64 * 1024;
    private static final int TAG_ORIENTATION = 0x0112;

    private ExifOrientation() {}

    /** Orientacija 1–8 (1 = brez spremembe). */
    static int read(byte[] jpeg) {
        try {
            return parse(jpeg);
        } catch (RuntimeException e) {
            return 1;
        }
    }

    private static int parse(byte[] data) {
        int limit = Math.min(data.length, SCAN_LIMIT);
        if (limit < 4 || u8(data, 0) != 0xFF || u8(data, 1) != 0xD8) {
            return 1;
        }
        int pos = 2;
        while (pos + 4 <= limit) {
            if (u8(data, pos) != 0xFF) {
                return 1;
            }
            int marker = u8(data, pos + 1);
            if (marker == 0xFF) {
                pos++; // polnilni bajt
                continue;
            }
            if (marker == 0xDA || marker == 0xD9) {
                return 1; // začetek podatkov slike: APP1 ni bil najden
            }
            int length = (u8(data, pos + 2) << 8) | u8(data, pos + 3);
            if (length < 2) {
                return 1;
            }
            int start = pos + 4;
            int end = pos + 2 + length;
            if (marker == 0xE1 && end <= limit && isExif(data, start, end)) {
                int result = orientationIn(data, start + 6, end);
                if (result != 0) {
                    return result;
                }
            }
            pos = end;
        }
        return 1;
    }

    private static boolean isExif(byte[] d, int start, int end) {
        return end - start >= 14
                && d[start] == 'E'
                && d[start + 1] == 'x'
                && d[start + 2] == 'i'
                && d[start + 3] == 'f'
                && d[start + 4] == 0
                && d[start + 5] == 0;
    }

    /** Orientacija iz glave TIFF v {@code [tiff, end)}; 0 = ni veljavne vrednosti. */
    private static int orientationIn(byte[] d, int tiff, int end) {
        boolean little;
        if (d[tiff] == 'I' && d[tiff + 1] == 'I') {
            little = true;
        } else if (d[tiff] == 'M' && d[tiff + 1] == 'M') {
            little = false;
        } else {
            return 0;
        }
        if (u16(d, tiff + 2, little) != 0x002A) {
            return 0;
        }
        long ifd = tiff + u32(d, tiff + 4, little);
        if (ifd < tiff || ifd + 2 > end) {
            return 0;
        }
        int count = u16(d, (int) ifd, little);
        for (int i = 0; i < count; i++) {
            long entry = ifd + 2 + 12L * i;
            if (entry + 12 > end) {
                return 0;
            }
            if (u16(d, (int) entry, little) == TAG_ORIENTATION) {
                int type = u16(d, (int) entry + 2, little);
                if (type != 3) {
                    return 0;
                }
                int value = u16(d, (int) entry + 8, little);
                return value >= 1 && value <= 8 ? value : 0;
            }
        }
        return 0;
    }

    private static int u8(byte[] d, int i) {
        return d[i] & 0xFF;
    }

    private static int u16(byte[] d, int i, boolean little) {
        return little ? u8(d, i) | (u8(d, i + 1) << 8) : (u8(d, i) << 8) | u8(d, i + 1);
    }

    private static long u32(byte[] d, int i, boolean little) {
        long a = u16(d, i, little);
        long b = u16(d, i + 2, little);
        return little ? a | (b << 16) : (a << 16) | b;
    }
}
