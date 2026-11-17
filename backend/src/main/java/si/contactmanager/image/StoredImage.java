package si.contactmanager.image;

/** Prebrana različica slike z revizijo (osnova za {@code photoRevision} in {@code ETag}). */
public record StoredImage(long revision, int size, String contentType, byte[] data) {}
