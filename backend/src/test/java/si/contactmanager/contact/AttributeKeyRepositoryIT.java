package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;
import si.contactmanager.support.ApiTest;

/**
 * Vrstice ključev atributov (016, FR-016-01, FR-016-04; research R-01): prvi tip velja, prost ključ prevzame nov tip,
 * ključ v uporabi ga obdrži, sočasno ustvarjanje istega ključa z različnima tipoma da en tip in en zavrnjen zahtevek,
 * skupine so neodvisne.
 */
@Tag("FR-016-01")
@Tag("FR-016-04")
class AttributeKeyRepositoryIT extends ApiTest {

    @Autowired
    AttributeKeyRepository keys;

    @Autowired
    TransactionTemplate tx;

    private UUID newGroup() {
        UUID group = UUID.randomUUID();
        jdbc.update("insert into contact_group (id, title) values (?, 'Skupina')", group);
        return group;
    }

    private UUID addContactWithKey(UUID group, String keyNorm) {
        UUID contact = UUID.randomUUID();
        jdbc.update("insert into contact (id, group_id, first_name) values (?, ?, 'Ana')", contact, group);
        jdbc.update(
                "insert into contact_attribute (contact_id, position, key, key_norm, value) values (?, 0, ?, ?, 'v')",
                contact,
                keyNorm,
                keyNorm);
        return contact;
    }

    @Test
    void aNewKeyTakesTheRequestedTypeAndStartsAtVersionZero() {
        UUID group = newGroup();

        AttributeType type = tx.execute(s -> keys.ensure(group, "mobilni", AttributeType.PHONE));

        assertThat(type).isEqualTo(AttributeType.PHONE);
        assertThat(keys.find(group, "mobilni")).hasValueSatisfying(row -> {
            assertThat(row.type()).isEqualTo(AttributeType.PHONE);
            assertThat(row.version()).isZero();
        });
        assertThat(keys.find(group, "ni-ga")).isEmpty();
    }

    @Test
    void aKeyInUseKeepsItsTypeWhateverIsRequested() {
        UUID group = newGroup();
        tx.executeWithoutResult(s -> keys.ensure(group, "mobilni", AttributeType.PHONE));
        addContactWithKey(group, "mobilni");

        AttributeType type = tx.execute(s -> keys.ensure(group, "mobilni", AttributeType.EMAIL));

        assertThat(type).isEqualTo(AttributeType.PHONE);
        assertThat(keys.contactCount(group, "mobilni")).isEqualTo(1);
        assertThat(keys.isFree(group, "mobilni")).isFalse();
        assertThat(keys.find(group, "mobilni").orElseThrow().version()).isZero();
    }

    @Test
    void aFreeKeyTakesANewTypeOnReuse() {
        UUID group = newGroup();
        tx.executeWithoutResult(s -> keys.ensure(group, "mobilni", AttributeType.PHONE));
        assertThat(keys.isFree(group, "mobilni")).isTrue();

        AttributeType type = tx.execute(s -> keys.ensure(group, "mobilni", AttributeType.EMAIL));

        assertThat(type).isEqualTo(AttributeType.EMAIL);
        assertThat(keys.find(group, "mobilni").orElseThrow().version()).isEqualTo(1);
    }

    @Test
    void groupsHaveIndependentTypesForTheSameKey() {
        UUID first = newGroup();
        UUID second = newGroup();

        tx.executeWithoutResult(s -> keys.ensure(first, "kontakt", AttributeType.PHONE));
        tx.executeWithoutResult(s -> keys.ensure(second, "kontakt", AttributeType.URL));

        assertThat(keys.find(first, "kontakt").orElseThrow().type()).isEqualTo(AttributeType.PHONE);
        assertThat(keys.find(second, "kontakt").orElseThrow().type()).isEqualTo(AttributeType.URL);
        assertThat(keys.find(first, "drugo")).isEmpty();
    }

    @Test
    void setTypeBumpsTheVersionUnderTheUpdateLock() {
        UUID group = newGroup();
        tx.executeWithoutResult(s -> keys.ensure(group, "mobilni", AttributeType.OTHER));

        long version = tx.execute(s -> {
            assertThat(keys.lockForUpdate(group, "mobilni")).isPresent();
            return keys.setType(group, "mobilni", AttributeType.PHONE);
        });

        assertThat(version).isEqualTo(1);
        assertThat(keys.find(group, "mobilni").orElseThrow().type()).isEqualTo(AttributeType.PHONE);
        assertThat(keys.lockForUpdate(UUID.randomUUID(), "mobilni")).isEmpty();
    }

    @Test
    void concurrentCreationOfTheSameKeyWithDifferentTypesYieldsOneTypeAndOneRejection() throws Exception {
        UUID group = newGroup();
        CountDownLatch firstEnsured = new CountDownLatch(1);

        CompletableFuture<AttributeType> first = CompletableFuture.supplyAsync(() -> tx.execute(s -> {
            AttributeType type = keys.ensure(group, "mobilni", AttributeType.PHONE);
            addContactWithKey(group, "mobilni");
            firstEnsured.countDown();
            sleep(400);
            return type;
        }));
        assertThat(firstEnsured.await(10, TimeUnit.SECONDS)).isTrue();
        // Drugi zahtevek počaka na potrditev prvega in vidi njegov tip (ključ je že v uporabi).
        CompletableFuture<AttributeType> second = CompletableFuture.supplyAsync(
                () -> tx.execute(s -> keys.ensure(group, "mobilni", AttributeType.EMAIL)));

        assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(AttributeType.PHONE);
        AttributeType winner = second.get(10, TimeUnit.SECONDS);
        assertThat(winner).isEqualTo(AttributeType.PHONE).isNotEqualTo(AttributeType.EMAIL);
        assertThat(keys.find(group, "mobilni").orElseThrow().type()).isEqualTo(AttributeType.PHONE);
        assertThat(jdbc.queryForObject("select count(*) from attribute_key where group_id = ?", Long.class, group))
                .isEqualTo(1);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
