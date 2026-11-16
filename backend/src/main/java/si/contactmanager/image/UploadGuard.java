package si.contactmanager.image;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.util.WebUtils;
import si.contactmanager.shared.error.ValidationError.FieldError;
import si.contactmanager.shared.error.ValidationException;

/**
 * Prevzem dela {@code file} iz zahtevka multipart (FR-018-15): točno ena datoteka. Razčlenitev je lena, zato se kliče
 * šele po preverjanju dostopa (feature-map §2.2: napaka datoteke je za {@code 409}).
 */
final class UploadGuard {

    private UploadGuard() {}

    /** Telo datoteke, največ {@code maxBytes + 1} bajtov; brez dela, prazna datoteka ali več datotek = 400. */
    static byte[] file(HttpServletRequest request, long maxBytes) {
        MultipartHttpServletRequest multipart = WebUtils.getNativeRequest(request, MultipartHttpServletRequest.class);
        if (multipart == null) {
            throw error("REQUIRED");
        }
        List<MultipartFile> files = multipart.getFiles("file");
        if (files.isEmpty() || files.get(0).isEmpty()) {
            throw error("REQUIRED");
        }
        if (files.size() > 1) {
            throw error("INVALID_IMAGE");
        }
        MultipartFile file = files.get(0);
        if (file.getSize() > maxBytes) {
            throw error("FILE_TOO_LARGE");
        }
        try (InputStream in = file.getInputStream()) {
            return in.readNBytes((int) maxBytes + 1);
        } catch (IOException e) {
            throw error("REQUIRED");
        }
    }

    /** Vrednost parametra {@code size}: 96, 256 ali 512 (privzeto 256), sicer 400. */
    static int size(String value) {
        if (value == null) {
            return 256;
        }
        return switch (value) {
            case "96" -> 96;
            case "256" -> 256;
            case "512" -> 512;
            default -> throw new ValidationException(List.of(new FieldError("size", "INVALID_VALUE")));
        };
    }

    private static ValidationException error(String code) {
        return new ValidationException(List.of(new FieldError("file", code)));
    }
}
