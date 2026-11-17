package si.contactmanager.image;

import com.fasterxml.jackson.annotation.JsonInclude;

/** Stanje po spremembi slike; {@code version} (skupine ali kontakta) je izpuščen pri {@code /api/me}. */
public record PhotoResult(
        Long photoRevision,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long version) {}
