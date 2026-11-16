package si.contactmanager.image;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import si.contactmanager.image.support.TestImages;

/** Razčlenjevalnik EXIF (FR-018-16): orientacije 1–8 v obeh vrstnih redih bajtov, neveljavno = 1. */
class ExifOrientationTest {

    private static final byte[] JPEG = TestImages.jpeg(32, 32);

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4, 5, 6, 7, 8})
    void readsEveryOrientationInBothByteOrders(int orientation) {
        assertThat(ExifOrientation.read(TestImages.withOrientation(JPEG, orientation, true)))
                .isEqualTo(orientation);
        assertThat(ExifOrientation.read(TestImages.withOrientation(JPEG, orientation, false)))
                .isEqualTo(orientation);
    }

    @Test
    void imageWithoutExifIsOrientationOne() {
        assertThat(ExifOrientation.read(JPEG)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 9, 255, 65535})
    void outOfRangeValueIsOrientationOne(int value) {
        assertThat(ExifOrientation.read(TestImages.withOrientation(JPEG, value, true)))
                .isEqualTo(1);
    }

    @Test
    void notAJpegOrTooShortIsOrientationOne() {
        assertThat(ExifOrientation.read(new byte[0])).isEqualTo(1);
        assertThat(ExifOrientation.read(new byte[] {(byte) 0xFF})).isEqualTo(1);
        assertThat(ExifOrientation.read(TestImages.png(8, 8))).isEqualTo(1);
    }

    @Test
    void truncatedExifSegmentIsOrientationOne() {
        byte[] full = TestImages.withOrientation(JPEG, 6, true);
        for (int cut : new int[] {3, 6, 10, 14, 20, 26, 30}) {
            assertThat(ExifOrientation.read(Arrays.copyOf(full, cut)))
                    .as("odrezano pri " + cut)
                    .isEqualTo(1);
        }
    }

    @Test
    void corruptedExifSegmentNeverThrows() {
        byte[] base = TestImages.withOrientation(JPEG, 6, false);
        for (int i = 4; i < 40; i++) {
            for (int value : new int[] {0x00, 0xFF, 0x7F}) {
                byte[] copy = base.clone();
                copy[i] = (byte) value;
                int result = ExifOrientation.read(copy);
                assertThat(result).as("bajt " + i + "=" + value).isBetween(1, 8);
            }
        }
    }

    @Test
    void wrongTagTypeOrIfdOffsetOutOfBoundsIsOrientationOne() {
        byte[] exif = TestImages.exifSegment(6, false, null);
        byte[] badType = exif.clone();
        badType[4 + 6 + 8 + 4 + 1] = 4; // vrsta oznake: LONG namesto SHORT
        assertThat(ExifOrientation.read(TestImages.insertAfterSoi(JPEG, badType)))
                .isEqualTo(1);
        byte[] badOffset = exif.clone();
        badOffset[4 + 6 + 4] = 0x7F; // odmik IFD daleč zunaj segmenta
        assertThat(ExifOrientation.read(TestImages.insertAfterSoi(JPEG, badOffset)))
                .isEqualTo(1);
    }

    @Test
    void nonExifApp1SegmentIsIgnored() {
        byte[] xmp = TestImages.segment(0xE1, "http://ns.adobe.com/xap/1.0/\0<x/>".getBytes());
        assertThat(ExifOrientation.read(TestImages.insertAfterSoi(JPEG, xmp))).isEqualTo(1);
        assertThat(ExifOrientation.read(TestImages.insertAfterSoi(JPEG, xmp, TestImages.exifSegment(3, true, null))))
                .isEqualTo(3);
    }

    @Test
    void orientationPastScanLimitIsIgnored() {
        byte[] padding = TestImages.segment(0xE2, new byte[65_000]);
        byte[] padding2 = TestImages.segment(0xE2, new byte[2_000]);
        byte[] data = TestImages.insertAfterSoi(JPEG, padding, padding2, TestImages.exifSegment(6, true, null));
        assertThat(ExifOrientation.read(data)).isEqualTo(1);
    }
}
