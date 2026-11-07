package si.contactmanager.contact;

import java.util.List;

/** Predlogi značk skupine (contracts/openapi.yaml – TagSuggestions). */
public record TagSuggestions(List<String> tags) {}
