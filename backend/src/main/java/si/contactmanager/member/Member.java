package si.contactmanager.member;

import java.time.Instant;
import java.util.UUID;
import si.contactmanager.group.Role;
import si.contactmanager.group.UserRef;

/** Član skupine v odgovorih (contracts/openapi.yaml – Member); {@code id} je opaken {@code memberId}. */
public record Member(
        UUID id,
        String name,
        String email,
        Role role,
        long version,
        boolean self,
        boolean canManage,
        UserRef updatedBy,
        Instant updatedAt) {}
