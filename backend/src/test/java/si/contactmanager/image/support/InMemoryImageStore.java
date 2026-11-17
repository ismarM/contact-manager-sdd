package si.contactmanager.image.support;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import si.contactmanager.image.ImageStore;
import si.contactmanager.image.Owner;
import si.contactmanager.image.ProcessedImage;
import si.contactmanager.image.StoredImage;

/**
 * Pomnilniška različica {@link ImageStore} za teste prenosljivosti (FR-018-19): drugačna shramba za istim vmesnikom
 * mora prestati isti nabor pogodbenih testov kot PostgreSQL. Odklop in priklop kontakta ({@link #detach}, {@link #attach})
 * nadomeščata sprožilca na tabeli {@code contact}.
 */
public final class InMemoryImageStore implements ImageStore {

    private record Entry(long revision, Map<Integer, StoredImage> variants) {}

    private final Map<Owner, Entry> images = new HashMap<>();
    private final Set<Owner> detached = new HashSet<>();

    @Override
    public synchronized long put(Owner owner, ProcessedImage image) {
        long revision = images.containsKey(owner) ? images.get(owner).revision() + 1 : 1;
        Map<Integer, StoredImage> variants = new HashMap<>();
        for (ProcessedImage.Variant variant : image.variants()) {
            variants.put(
                    variant.size(),
                    new StoredImage(
                            revision,
                            variant.size(),
                            variant.contentType(),
                            variant.data().clone()));
        }
        images.put(owner, new Entry(revision, variants));
        return revision;
    }

    @Override
    public synchronized Optional<StoredImage> get(Owner owner, int size) {
        Entry entry = visible(owner);
        if (entry == null) {
            return Optional.empty();
        }
        return entry.variants().keySet().stream()
                .filter(variant -> variant <= size)
                .max(Integer::compare)
                .map(entry.variants()::get);
    }

    @Override
    public synchronized Optional<Long> revision(Owner owner) {
        Entry entry = visible(owner);
        return entry == null ? Optional.empty() : Optional.of(entry.revision());
    }

    @Override
    public synchronized boolean delete(Owner owner) {
        detached.remove(owner);
        return images.remove(owner) != null;
    }

    @Override
    public synchronized Map<UUID, Long> contactRevisions(UUID group, Collection<UUID> contactIds) {
        Map<UUID, Long> revisions = new HashMap<>();
        for (UUID contact : contactIds) {
            revision(Owner.contact(group, contact)).ifPresent(revision -> revisions.put(contact, revision));
        }
        return revisions;
    }

    @Override
    public synchronized void mergeInto(UUID group, UUID keeper, List<UUID> losers) {
        Owner keeperOwner = Owner.contact(group, keeper);
        UUID adopted = null;
        if (!images.containsKey(keeperOwner)) {
            adopted = losers.stream()
                    .filter(loser -> images.containsKey(Owner.contact(group, loser)))
                    .findFirst()
                    .orElse(null);
        }
        if (adopted != null) {
            reassign(Owner.contact(group, adopted), keeperOwner);
        }
        for (UUID loser : losers) {
            if (!loser.equals(adopted)) {
                delete(Owner.contact(group, loser));
            }
        }
    }

    @Override
    public synchronized void reassign(Owner from, Owner to) {
        Entry entry = images.remove(from);
        if (entry != null) {
            Map<Integer, StoredImage> variants = new HashMap<>();
            long revision = entry.revision() + 1;
            entry.variants()
                    .forEach((size, stored) ->
                            variants.put(size, new StoredImage(revision, size, stored.contentType(), stored.data())));
            images.put(to, new Entry(revision, variants));
        }
    }

    /** Kontakt je izbrisan: njegova slika ostane, a ni vidna (kot po sprožilcu {@code AFTER DELETE}). */
    public synchronized void detach(Owner contact) {
        detached.add(contact);
    }

    /** Kontakt je obnovljen: slika je spet vidna (kot po sprožilcu {@code AFTER INSERT}). */
    public synchronized void attach(Owner contact) {
        detached.remove(contact);
    }

    private Entry visible(Owner owner) {
        return detached.contains(owner) ? null : images.get(owner);
    }
}
