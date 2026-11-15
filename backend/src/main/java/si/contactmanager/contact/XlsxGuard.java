package si.contactmanager.contact;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

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
        // ZipFile bere osrednji imenik (podpira opisnike podatkov, ki jih ZipInputStream pri xlsx ne zna); začasna
        // datoteka se vedno izbriše.
        Path temp = null;
        try {
            temp = Files.createTempFile("uvoz-", ".xlsx");
            Files.write(temp, file);
            try (ZipFile zip = new ZipFile(temp.toFile())) {
                Enumeration<? extends ZipEntry> all = zip.entries();
                while (all.hasMoreElements()) {
                    ZipEntry entry = all.nextElement();
                    if (++entries > MAX_ENTRIES) {
                        throw new Rejected("NOT_XLSX");
                    }
                    workbook |= entry.getName().equals("xl/workbook.xml");
                    try (InputStream in = zip.getInputStream(entry)) {
                        int read;
                        while ((read = in.read(buffer)) > 0) {
                            total += read;
                            if (total > MAX_UNCOMPRESSED || (total > RATIO_FLOOR && total / file.length > MAX_RATIO)) {
                                throw new Rejected("NOT_XLSX");
                            }
                        }
                    }
                }
            }
        } catch (IOException e) {
            throw new Rejected("NOT_XLSX");
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException e) {
                    temp.toFile().deleteOnExit();
                }
            }
        }
        if (!workbook) {
            throw new Rejected("NOT_XLSX");
        }
    }
}
