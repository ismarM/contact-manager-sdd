package si.contactmanager.group;

import java.util.UUID;

/** Skupina v odgovoru API (contracts/openapi.yaml – ApiGroup): podatki skupine in vloga uporabnika. */
public record ApiGroup(UUID id, String title, String description, String color, boolean archived, Role role) {}
