package si.contactmanager.apikey;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.contactmanager.apikey.ApiKeyInputParser.GroupChoice;
import si.contactmanager.apikey.ApiKeyInputParser.Input;
import si.contactmanager.group.GroupAccess;
import si.contactmanager.shared.error.ApiKeyLimitException;
import si.contactmanager.shared.error.NotFoundException;
import si.contactmanager.shared.security.ApiKeyPrincipal.Permission;
import si.contactmanager.shared.security.ApiKeyPrincipal.Scope;

/**
 * Upravljanje API ključev prijavljenega uporabnika (019, FR-019-01 … -04, -21; research R-09): ustvarjanje (žeton samo
 * v odgovoru), seznam s stanji in preklic. Žeton se ne hrani in ne beleži.
 */
@Service
class ApiKeyService {

    /** Največ aktivnih ključev na uporabnika (FR-019-01). */
    static final int LIMIT = 10;

    /** »Kmalu poteče« (FR-019-04). */
    static final Duration EXPIRING_SOON = Duration.ofDays(7);

    enum Status {
        ACTIVE,
        EXPIRED,
        REVOKED
    }

    record GroupView(UUID groupId, String title, Permission permission) {}

    /** Ključ na seznamu (contracts/openapi.yaml – ApiKey); nikoli žeton. */
    record KeyView(
            UUID id,
            String name,
            String hint,
            boolean allGroups,
            Permission allGroupsPermission,
            List<GroupView> groups,
            Instant createdAt,
            Instant expiresAt,
            Instant lastUsedAt,
            Instant revokedAt,
            Status status,
            boolean expiringSoon,
            int requestsLast24h) {}

    /** Nov ključ: {@code token} se pokaže samo enkrat. */
    record Created(KeyView key, String token) {}

    /** Števila zahtev po izidu; {@code day} je {@code null} pri skupnih številih (izpuščeno v JSON). */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    record DayView(LocalDate day, long total, long readOk, long writeOk, long errors, long rateLimited) {}

    record UsageView(int days, DayView totals, List<DayView> perDay) {}

    private final ApiKeyRepository repository;
    private final ApiKeyTokens tokens;
    private final GroupAccess access;
    private final ApiUsageRepository usage;
    private final ApiKeyProperties properties;
    private final Clock clock;

    ApiKeyService(
            ApiKeyRepository repository,
            ApiKeyTokens tokens,
            GroupAccess access,
            ApiUsageRepository usage,
            ApiKeyProperties properties,
            Clock clock) {
        this.repository = repository;
        this.tokens = tokens;
        this.access = access;
        this.usage = usage;
        this.properties = properties;
        this.clock = clock;
    }

    List<KeyView> list(long user) {
        Instant now = Instant.now();
        List<ApiKeyRepository.Row> rows = repository.list(user);
        Map<UUID, List<ApiKeyRepository.GroupRow>> groups =
                repository.groups(rows.stream().map(ApiKeyRepository.Row::id).toList());
        return rows.stream()
                .map(row -> view(row, groups.getOrDefault(row.id(), List.of()), now))
                .toList();
    }

    /**
     * Ustvari ključ: skupine, katerih uporabnik ni član (ali neveljaven id) → 404; meja aktivnih pod zaklepom
     * {@code app_user} → 409. V obeh primerih nič ne nastane.
     */
    @Transactional
    Created create(long user, Input input) {
        Map<UUID, Permission> groups = new LinkedHashMap<>();
        for (GroupChoice choice : input.groups()) {
            groups.put(access.membership(user, choice.groupId()).groupId(), choice.permission());
        }
        if (repository.lockAndCountActive(user) >= LIMIT) {
            throw new ApiKeyLimitException();
        }
        Scope scope = input.allGroupsPermission() != null
                ? Scope.allGroups(input.allGroupsPermission())
                : Scope.groups(groups);
        UUID id = repository.newId();
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant expiresAt = input.expiresInDays() == null ? null : now.plus(Duration.ofDays(input.expiresInDays()));
        String token = tokens.issue(user, id, scope, now, expiresAt);
        String hint = token.substring(token.length() - 6);
        repository.insert(id, user, input.name(), hint, input.allGroupsPermission(), now, expiresAt);
        groups.forEach((group, permission) -> repository.insertGroup(id, group, permission));
        ApiKeyRepository.Row row = new ApiKeyRepository.Row(
                id, input.name(), hint, input.allGroupsPermission(), now, expiresAt, null, null, 0);
        List<ApiKeyRepository.GroupRow> groupRows =
                repository.groups(List.of(id)).getOrDefault(id, List.of());
        return new Created(view(row, groupRows, Instant.now()), token);
    }

    /** Preklic lastnega ključa (idempotenten); tuj ali neobstoječ → 404. */
    void revoke(long user, UUID id) {
        if (!repository.revoke(user, id)) {
            throw new NotFoundException();
        }
    }

    /**
     * Statistika ključa za {@code days} (7 ali 30) dni, ki se končajo danes po {@code api-keys.stats-zone}: števila po
     * dnevih (manjkajoči dnevi 0, od najstarejšega) in skupna števila (FR-019-20). Tuj, neobstoječ ali pred več kot
     * 90 dnevi končan ključ → 404.
     */
    UsageView usage(long user, UUID id, int days) {
        if (!repository.visible(user, id)) {
            throw new NotFoundException();
        }
        ZoneId zone = properties.statsZone();
        LocalDate today = LocalDate.now(clock.withZone(zone));
        LocalDate first = today.minusDays(days - 1L);
        Map<LocalDate, long[]> byDay = new LinkedHashMap<>();
        for (LocalDate day = first; !day.isAfter(today); day = day.plusDays(1)) {
            byDay.put(day, new long[4]);
        }
        for (ApiUsageRepository.HourRow row :
                usage.hours(id, first.atStartOfDay(zone).toInstant())) {
            long[] counts = byDay.get(row.hour().atZone(zone).toLocalDate());
            if (counts != null) {
                counts[0] += row.readOk();
                counts[1] += row.writeOk();
                counts[2] += row.errors();
                counts[3] += row.rateLimited();
            }
        }
        long[] totals = new long[4];
        List<DayView> perDay = new java.util.ArrayList<>();
        byDay.forEach((day, c) -> {
            for (int i = 0; i < 4; i++) {
                totals[i] += c[i];
            }
            perDay.add(new DayView(day, c[0] + c[1] + c[2] + c[3], c[0], c[1], c[2], c[3]));
        });
        return new UsageView(
                days,
                new DayView(
                        null,
                        totals[0] + totals[1] + totals[2] + totals[3],
                        totals[0],
                        totals[1],
                        totals[2],
                        totals[3]),
                perDay);
    }

    private static KeyView view(ApiKeyRepository.Row row, List<ApiKeyRepository.GroupRow> groups, Instant now) {
        Status status = row.revokedAt() != null
                ? Status.REVOKED
                : row.expiresAt() != null && !row.expiresAt().isAfter(now) ? Status.EXPIRED : Status.ACTIVE;
        boolean expiringSoon = status == Status.ACTIVE
                && row.expiresAt() != null
                && !row.expiresAt().isAfter(now.plus(EXPIRING_SOON));
        return new KeyView(
                row.id(),
                row.name(),
                row.hint(),
                row.allGroupsPermission() != null,
                row.allGroupsPermission(),
                groups.stream()
                        .map(g -> new GroupView(g.groupId(), g.title(), g.permission()))
                        .toList(),
                row.createdAt(),
                row.expiresAt(),
                row.lastUsedAt(),
                row.revokedAt(),
                status,
                expiringSoon,
                row.requestsLast24h());
    }
}
