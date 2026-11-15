package si.contactmanager.contact;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;

/**
 * Zaščita pred zip-bombo pred branjem {@code .xlsx} (014 research R-01; fastexcel-reader je nima): največ
 * {@value #MAX_ENTRIES} vnosov, vsota dejansko razširjenih bajtov največ {@value #MAX_UNCOMPRESSED} (štetje med
 * branjem, glavi arhiva se ne zaupa), razmerje razširjeno : stisnjeno največ {@value #MAX_RATIO} nad 1 MB; arhiv mora
 * vsebovati {@code xl/workbook.xml}.
 */
final class XlsxGuard {

    static final int MAX_ENTRIES = 500;

    static final long MAX_UNCOMPRESSED = 100L * 1024 * 1024;

    static final long MAX_RATIO = 100;

    private static final long RATIO_FLOOR = 1024L * 1024;

    /** Datoteka ni varna ali ni preglednica; {@code code} je koda napake polja {@code file}. */
    static final class Rejected extends Exception {

        private static final long serialVersionUID = 1L;

        Rejected(String code) {
            super(code);
        }

        String code() {
            return getMessage();
        }
    }

    private XlsxGuard() {}

    static void check(byte[] file) throws Rejected {
        if (file.length < 4 || file[0] != 'P' || file[1] != 'K') {
            throw new Rejected("NOT_XLSX");
        }
        int entries = 0;
        long total = 0;
        boolean workbook = false;
        byte[] buffer = new byte[64 * 1024];
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(file))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > MAX_ENTRIES) {
                    throw new Rejected("NOT_XLSX");
                }
                workbook |= entry.getName().equals("xl/workbook.xml");
                int read;
                while ((read = zip.read(buffer)) > 0) {
                    total += read;
                    if (total > MAX_UNCOMPRESSED || (total > RATIO_FLOOR && total / file.length > MAX_RATIO)) {
                        throw new Rejected("NOT_XLSX");
                    }
                }
            }
        } catch (ZipException e) {
            throw new Rejected("NOT_XLSX");
        } catch (IOException e) {
            throw new Rejected("NOT_XLSX");
        }
        if (!workbook) {
            throw new Rejected("NOT_XLSX");
        }
    }
}
