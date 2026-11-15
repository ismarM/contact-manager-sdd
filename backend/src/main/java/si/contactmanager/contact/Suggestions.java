package si.contactmanager.contact;

import java.util.List;

/** Odgovor predlogov skupine, največ {@link SuggestionRepository#LIMIT} (contracts/openapi.yaml – Suggestions). */
public record Suggestions(List<Suggestion> items) {}
