package si.contactmanager.member;

import java.util.List;

/** Odgovor {@code GET /api/groups/{groupId}/members}; {@code deletedOwner} = trajno arhivirana skupina (R-07). */
public record Members(long total, int page, int size, boolean deletedOwner, List<Member> items) {}
