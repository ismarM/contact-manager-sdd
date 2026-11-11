package si.contactmanager.contact;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import si.contactmanager.support.ApiTest;

/**
 * Kolaciji ICU na sliki, kot v Compose (D-63, D-64; research R-01, R-03): obstoj, nedeterminizem, vrstni red in
 * enakosti. Pričakovanja so dobesedna.
 */
@Tag("FR-008-07")
class ContactSortCollationIT extends ApiTest {

    private boolean bool(String sql) {
        return Boolean.TRUE.equals(jdbc.queryForObject(sql, Boolean.class));
    }

    @Test
    @Tag("FR-008-02")
    @Tag("FR-008-07")
    void bothCollationsExistAsNondeterministicIcu() {
        List<String> rows = jdbc.queryForList(
                "select collname || ':' || collprovider::text || ':' || collisdeterministic::text from pg_collation"
                        + " where collname in ('sort_sl', 'search_fold') order by collname",
                String.class);

        assertThat(rows).containsExactly("search_fold:i:false", "sort_sl:i:false");
    }

    @Test
    void databaseIsPostgreSql18OrNewer() {
        Integer version = jdbc.queryForObject("select current_setting('server_version_num')::int", Integer.class);

        assertThat(version).isGreaterThanOrEqualTo(180000);
    }

    @Test
    void sortKeyColumnsUseTheSloveneCollation() {
        List<String> collations = jdbc.queryForList(
                "select a.attname || ':' || c.collname from pg_attribute a join pg_collation c on c.oid = a.attcollation"
                        + " where a.attrelid = 'contact'::regclass and a.attname in ('sort_last', 'sort_first')"
                        + " order by a.attname",
                String.class);

        assertThat(collations).containsExactly("sort_first:sort_sl", "sort_last:sort_sl");
    }

    @Test
    void sortCollationOrdersTheAlphabetLikeSlovene() {
        String ordered = jdbc.queryForObject(
                "select string_agg(n, ',' order by n collate sort_sl) from unnest(array["
                        + "'Zupan', 'Žagar', 'Čeh', 'Cene', 'Dana', 'Šuligoj', 'Suhadolnik', 'Ana']) n",
                String.class);

        assertThat(ordered).isEqualTo("Ana,Cene,Čeh,Dana,Suhadolnik,Šuligoj,Zupan,Žagar");
    }

    @Test
    void sortCollationIgnoresCaseButNotCaronLetters() {
        assertThat(bool("select 'Novak' = 'novak' collate sort_sl")).isTrue();
        assertThat(bool("select 'ČEH' = 'čeh' collate sort_sl")).isTrue();
        assertThat(bool("select 'Čeh' = 'ceh' collate sort_sl")).isFalse();
        assertThat(bool("select 'Šuligoj' = 'Suligoj' collate sort_sl")).isFalse();
        assertThat(bool("select 'Žagar' < 'Zupan' collate sort_sl")).isFalse();
        assertThat(bool("select 'Čeh' > 'Cene' collate sort_sl")).isTrue();
    }

    @Test
    @Tag("FR-008-02")
    void searchCollationIgnoresCaseAndDiacriticsInSubstrings() {
        assertThat(jdbc.queryForObject("select strpos('Zupančič' collate search_fold, 'ZUPANC')", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select strpos('Zupancic' collate search_fold, 'zupanč')", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select strpos('Cene' collate search_fold, 'č')", Integer.class))
                .isEqualTo(1);
        for (String[] pair :
                new String[][] {{"Đorđe", "dorde"}, {"Łukasz", "lukasz"}, {"Ćosić", "cosic"}, {"Müller", "muller"}}) {
            assertThat(jdbc.queryForObject("select strpos(? collate search_fold, ?)", Integer.class, pair[0], pair[1]))
                    .as(pair[0])
                    .isEqualTo(1);
        }
    }

    @Test
    @Tag("FR-008-02")
    void searchCollationKeepsSpacesAndPunctuationSignificant() {
        assertThat(jdbc.queryForObject("select strpos('041 123 456' collate search_fold, '041123')", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject("select strpos('041 123 456' collate search_fold, '041 123')", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select strpos('Novak-Kralj' collate search_fold, 'novakkralj')", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject("select strpos('100%' collate search_fold, '%')", Integer.class))
                .isEqualTo(4);
        assertThat(jdbc.queryForObject("select strpos('abc' collate search_fold, E'\\u200b')", Integer.class))
                .isZero();
    }
}
