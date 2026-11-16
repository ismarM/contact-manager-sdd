package si.contactmanager.image;

import java.util.Optional;
import java.util.UUID;

/**
 * Shramba slik (research R-01): vmesnik, za katerim je danes PostgreSQL; prehod na drugo shrambo ne spremeni API-ja.
 * Vsaka operacija ima lastnika, zato brez {@code group_id}/{@code user_id} v pogoju ni mogoče nasloviti tuje slike.
 */
public interface ImageStore {

    /** Shrani ali zamenja sliko lastnika (ena slika na lastnika); vrne novo revizijo (1 ob prvi, sicer +1). */
    long put(Owner owner, ProcessedImage image);

    /**
     * Največja shranjena različica, ki ni večja od {@code size}; prazno, če slike ni (ali je kontakt izbrisan).
     * Prebere se samo ta različica.
     */
    Optional<StoredImage> get(Owner owner, int size);

    /** Revizija slike brez branja bajtov; prazno, če slike ni. */
    Optional<Long> revision(Owner owner);

    /** Izbriše sliko lastnika; vrne, ali je slika obstajala. */
    boolean delete(Owner owner);

    /** Revizije slik kontaktov skupine (samo obstoječi, priklopljeni kontakti s sliko); brez branja bajtov. */
    java.util.Map<UUID, Long> contactRevisions(UUID group, java.util.Collection<UUID> contactIds);

    /**
     * Združevanje dvojnikov (FR-018-11): preživeli ohrani svojo sliko; sicer prevzame sliko prvega poraženega (po
     * vrstnem redu {@code losers}), ki jo ima; slike ostalih poraženih se izbrišejo.
     */
    void mergeInto(UUID group, UUID keeper, java.util.List<UUID> losers);

    /** Preusmeri sliko kontakta {@code from} na kontakt {@code to} iste skupine; {@code to} ne sme imeti slike. */
    void reassign(Owner from, Owner to);
}
