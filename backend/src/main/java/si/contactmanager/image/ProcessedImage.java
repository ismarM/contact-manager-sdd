package si.contactmanager.image;

import java.util.List;

/** Rezultat obdelave: različice od največje do najmanjše; vedno vsebuje različico 96. */
public record ProcessedImage(List<Variant> variants) {

    /** Ena različica: ključ velikosti (96, 256, 512), vrsta vsebine in obdelani bajti. */
    public record Variant(int size, String contentType, byte[] data) {}
}
