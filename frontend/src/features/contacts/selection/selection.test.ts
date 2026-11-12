import { describe, expect, it } from 'vitest';

import {
  addMatches,
  applyCheck,
  clear,
  emptySelection,
  MAX_QUERIES,
  pageState,
  removeMissing,
  type Selection,
  type SelectionChange,
  type SelectionParams,
  SELECTION_LIMIT,
  setPage,
  toggle,
} from './selection';

// Čisti model izbora (FR-009-01, FR-009-02, FR-009-04, FR-009-18; data-model.md – Selection; research.md R-10, D-73).
// Vsi primeri so zapisani dobesedno iz specifikacije; model je nespremenljiv (operacije vračajo nov izbor ali `limit`).

const GROUP = 'skupina-1';
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `k${from + i}`);
const params = (overrides: Partial<SelectionParams> = {}): SelectionParams => ({
  q: '',
  f: [],
  tag: ['konferenca2025'],
  ...overrides,
});

function unwrap(change: SelectionChange): Selection {
  expect(change.ok).toBe(true);
  if (!change.ok) throw new Error('pričakovan uspeh');
  return change.selection;
}

function selected(ids: string[]): Selection {
  return unwrap(setPage(emptySelection(GROUP), ids, true));
}

const sorted = (set: Set<string>) => [...set].sort();

describe('selection – posamezni izbor in stran', () => {
  it('FR-009-01: toggle doda in odstrani kontakt; vhodni izbor se ne spremeni', () => {
    const empty = emptySelection(GROUP);

    const one = unwrap(toggle(empty, 'k1'));
    expect(one.ids.has('k1')).toBe(true);
    expect(empty.ids.size).toBe(0);

    const none = unwrap(toggle(one, 'k1'));
    expect(none.ids.size).toBe(0);
    expect(one.ids.has('k1')).toBe(true);
    expect(none.groupId).toBe(GROUP);
  });

  it('FR-009-01: setPage izbere vse kontakte strani in jih odznači; izbor drugih strani ostane', () => {
    const page1 = range(1, 25);
    const page2 = range(26, 50);
    const both = unwrap(setPage(selected(page2), page1, true));
    expect(both.ids.size).toBe(50);

    const withoutPage1 = unwrap(setPage(both, page1, false));
    expect(sorted(withoutPage1.ids)).toEqual(sorted(new Set(page2)));
  });

  it('FR-009-01: pageState je checked, mixed ali unchecked', () => {
    const page = range(1, 25);
    expect(pageState(emptySelection(GROUP), page)).toBe('unchecked');
    expect(pageState(selected(range(1, 10)), page)).toBe('mixed');
    expect(pageState(selected(page), page)).toBe('checked');
    // Izbor drugih strani ne vpliva na stanje te strani.
    expect(pageState(selected(range(26, 50)), page)).toBe('unchecked');
    expect(pageState(selected([...page, ...range(26, 30)]), page)).toBe('checked');
  });

  it('FR-009-04: ročni toggle 10 001. kontakta vrne limit in ne spremeni izbora', () => {
    const full = selected(range(1, SELECTION_LIMIT));
    expect(full.ids.size).toBe(10_000);

    const change = toggle(full, 'k-novi');
    expect(change).toEqual({ ok: false, reason: 'limit' });
    expect(full.ids.size).toBe(10_000);
    expect(full.ids.has('k-novi')).toBe(false);
    // Odznačitev pri polnem izboru deluje.
    expect(unwrap(toggle(full, 'k1')).ids.size).toBe(9_999);
  });

  it('FR-009-04: setPage, ki bi presegel mejo, vrne limit; natanko 10 000 je dovoljeno', () => {
    const base = selected(range(1, 9_990));
    expect(setPage(base, range(9_991, 10_001), true)).toEqual({ ok: false, reason: 'limit' });
    expect(unwrap(setPage(base, range(9_991, 10_000), true)).ids.size).toBe(10_000);
  });

  it('FR-009-02: clear izprazni izbor in poizvedbe, skupina ostane', () => {
    const withQuery = unwrap(addMatches(selected(['m1']), params(), ['a', 'b']));
    const cleared = clear(withQuery);
    expect(cleared.ids.size).toBe(0);
    expect(cleared.queries).toEqual([]);
    expect(cleared.groupId).toBe(GROUP);
  });
});

describe('selection – »Izberi vse zadetke« (addMatches)', () => {
  it('FR-009-03: doda vse zadetke in si zapomni poizvedbo', () => {
    const next = unwrap(addMatches(emptySelection(GROUP), params(), range(1, 312)));

    expect(next.ids.size).toBe(312);
    expect(next.queries).toHaveLength(1);
    expect(next.queries[0]?.params).toEqual(params());
    expect(next.queries[0]?.added.size).toBe(312);
    expect(next.queries[0]?.deselected.size).toBe(0);
  });

  it('FR-009-04: unija 800 izbranih in 1500 zadetkov, od katerih jih je 300 že izbranih, je 2000', () => {
    const base = selected(range(1, 800));
    const next = unwrap(addMatches(base, params(), range(501, 2_000)));

    expect(range(501, 2_000)).toHaveLength(1_500);
    expect(next.ids.size).toBe(2_000);
  });

  it('FR-009-04: unija 9000 izbranih in 1500 novih zadetkov vrne limit in ne spremeni izbora', () => {
    const base = selected(range(1, 9_000));
    const change = addMatches(base, params(), range(9_001, 10_500));

    expect(change).toEqual({ ok: false, reason: 'limit' });
    expect(base.ids.size).toBe(9_000);
    expect(base.queries).toEqual([]);
  });

  it('FR-009-04: unija 10 001 vrne limit, natanko 10 000 je dovoljeno; podvojeni zadetki se štejejo enkrat', () => {
    expect(addMatches(emptySelection(GROUP), params(), range(1, 10_001))).toEqual({
      ok: false,
      reason: 'limit',
    });
    const exact = unwrap(addMatches(emptySelection(GROUP), params(), range(1, 10_000)));
    expect(exact.ids.size).toBe(10_000);

    const duplicates = unwrap(addMatches(emptySelection(GROUP), params(), ['k1', 'k1', 'k2']));
    expect(duplicates.ids.size).toBe(2);
  });

  it('FR-009-18: ročno odznačen kontakt iz poizvedbe gre v njen deselected in ne v izbor', () => {
    const next = unwrap(
      toggle(unwrap(addMatches(emptySelection(GROUP), params(), ['a', 'b', 'c'])), 'b'),
    );

    expect(sorted(next.ids)).toEqual(['a', 'c']);
    expect(sorted(next.queries[0]?.deselected ?? new Set())).toEqual(['b']);
  });

  it('FR-009-18: ročno izbran kontakt ne pripada nobeni poizvedbi in ob odznačitvi ne gre v deselected', () => {
    const base = unwrap(addMatches(selected(['m1']), params(), ['a']));
    const next = unwrap(toggle(base, 'm1'));

    expect(next.ids.has('m1')).toBe(false);
    expect(next.queries[0]?.deselected.size).toBe(0);
    expect(next.queries[0]?.added.has('m1')).toBe(false);
  });
});

describe('selection – omejitve poizvedb (R-10, D-73)', () => {
  it('FR-009-18: ponovljen »vse zadetke« z enakimi parametri se zlije v eno poizvedbo', () => {
    const first = unwrap(addMatches(emptySelection(GROUP), params(), ['k1', 'k2', 'k3']));
    const second = unwrap(addMatches(first, params(), ['k3', 'k4']));

    expect(second.queries).toHaveLength(1);
    expect(sorted(second.queries[0]?.added ?? new Set())).toEqual(['k1', 'k2', 'k3', 'k4']);
    expect(second.ids.size).toBe(4);
  });

  it('FR-009-18: zlitje je po vrednosti parametrov, ne po identiteti objekta', () => {
    const first = unwrap(addMatches(emptySelection(GROUP), params({ tag: ['a', 'b'] }), ['k1']));
    const second = unwrap(addMatches(first, params({ tag: ['a', 'b'] }), ['k2']));
    const different = unwrap(addMatches(second, params({ tag: ['a'] }), ['k3']));

    expect(second.queries).toHaveLength(1);
    expect(different.queries).toHaveLength(2);
  });

  it('FR-009-18: nova poizvedba prevzame skupne kontakte; identiteta je v največ eni poizvedbi', () => {
    const p1 = params({ q: 'Novak' });
    const p2 = params({ q: 'Kralj' });
    const first = unwrap(addMatches(emptySelection(GROUP), p1, ['k1', 'k2', 'k3']));
    // k3 odznačen pri prvi poizvedbi; druga poizvedba ga ima med zadetki.
    const afterDeselect = unwrap(toggle(first, 'k3'));
    const second = unwrap(addMatches(afterDeselect, p2, ['k3', 'k4']));

    const [older, newer] = second.queries;
    expect(older?.params).toEqual(p1);
    expect(newer?.params).toEqual(p2);
    expect(older?.added.has('k3')).toBe(false);
    expect(older?.deselected.has('k3')).toBe(false);
    expect(newer?.added.has('k3')).toBe(true);
    expect(sorted(second.ids)).toEqual(['k1', 'k2', 'k3', 'k4']);
  });

  it('FR-009-18: 21. poizvedba pozabi najstarejšo; njeni kontakti ostanejo v izboru', () => {
    let selection = emptySelection(GROUP);
    for (let n = 1; n <= MAX_QUERIES + 1; n += 1) {
      selection = unwrap(
        addMatches(selection, params({ q: `poizvedba${n}` }), range(n * 10, n * 10 + 4)),
      );
    }

    expect(MAX_QUERIES).toBe(20);
    expect(selection.queries).toHaveLength(20);
    expect(selection.queries.some((query) => query.params.q === 'poizvedba1')).toBe(false);
    expect(selection.queries.some((query) => query.params.q === 'poizvedba21')).toBe(true);
    expect(selection.ids.size).toBe(105);
    expect(range(10, 14).every((id) => selection.ids.has(id))).toBe(true);
  });

  it('FR-009-18: skupaj več kot 10 000 odznačenih kontaktov pozabi najstarejšo poizvedbo', () => {
    const p1 = params({ q: 'prva' });
    const p2 = params({ q: 'druga' });
    let selection = unwrap(addMatches(emptySelection(GROUP), p1, range(1, 6_000)));
    selection = unwrap(setPage(selection, range(1, 6_000), false));
    expect(selection.queries[0]?.deselected.size).toBe(6_000);

    selection = unwrap(addMatches(selection, p2, range(6_001, 12_000)));
    selection = unwrap(setPage(selection, range(6_001, 12_000), false));

    const totalDeselected = selection.queries.reduce(
      (sum, query) => sum + query.deselected.size,
      0,
    );
    expect(totalDeselected).toBeLessThanOrEqual(10_000);
    expect(selection.queries.some((query) => query.params.q === 'prva')).toBe(false);
    expect(selection.queries.some((query) => query.params.q === 'druga')).toBe(true);
  });
});

describe('selection – preverjanje sprememb (applyCheck, removeMissing)', () => {
  /** 12 zadetkov poizvedbe (k1 … k12), kot v scenariju US3-6. */
  const base = () => unwrap(addMatches(emptySelection(GROUP), params(), range(1, 12)));
  const check = {
    changed: true,
    missing: ['k1'],
    queries: [{ newMatches: ['n1', 'n2'], noLongerMatching: ['k2'] }],
  };

  it('FR-009-18: odstrani neobstoječe, doda nove zadetke in odstrani neustrezne ob zastavici → 12', () => {
    const next = unwrap(applyCheck(base(), check, true));

    expect(next.ids.size).toBe(12);
    expect(next.ids.has('k1')).toBe(false);
    expect(next.ids.has('k2')).toBe(false);
    expect(next.ids.has('n1')).toBe(true);
    expect(next.ids.has('n2')).toBe(true);
  });

  it('FR-009-18: brez zastavice ostanejo neustrezni izbrani → 13', () => {
    const next = unwrap(applyCheck(base(), check, false));

    expect(next.ids.size).toBe(13);
    expect(next.ids.has('k1')).toBe(false);
    expect(next.ids.has('k2')).toBe(true);
  });

  it('FR-009-18: posodobitev, ki bi presegla 10 000, vrne limit in ne spremeni izbora', () => {
    const near = unwrap(addMatches(emptySelection(GROUP), params(), range(1, SELECTION_LIMIT - 1)));
    const change = applyCheck(
      near,
      { changed: true, missing: [], queries: [{ newMatches: ['n1', 'n2'], noLongerMatching: [] }] },
      true,
    );

    expect(change).toEqual({ ok: false, reason: 'limit' });
    expect(near.ids.size).toBe(9_999);
  });

  it('FR-009-18: removeMissing odstrani kontakte iz izbora in poizvedb', () => {
    const next = removeMissing(base(), ['k1', 'k5']);

    expect(next.ids.size).toBe(10);
    expect(next.ids.has('k1')).toBe(false);
    expect(next.queries[0]?.added.has('k5')).toBe(false);
    expect(next.queries[0]?.deselected.has('k5')).toBe(false);
  });
});

describe('selection – lastnosti na naključnih zaporedjih', () => {
  /** Mulberry32: določeno seme, ponovljivo zaporedje. */
  function random(seed: number) {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function assertInvariants(selection: Selection) {
    expect(selection.ids.size).toBeLessThanOrEqual(10_000);
    expect(selection.queries.length).toBeLessThanOrEqual(20);
    let deselected = 0;
    let addedSelected = 0;
    selection.queries.forEach((query) => {
      deselected += query.deselected.size;
      for (const id of query.added) {
        if (selection.ids.has(id)) addedSelected += 1;
      }
    });
    expect(deselected).toBeLessThanOrEqual(10_000);
    expect(addedSelected).toBeLessThanOrEqual(10_000);
    // Vsak kontakt pripada največ eni poizvedbi (added ali deselected).
    const membership = new Map<string, number>();
    selection.queries.forEach((query) => {
      for (const id of new Set([...query.added, ...query.deselected])) {
        membership.set(id, (membership.get(id) ?? 0) + 1);
      }
    });
    for (const count of membership.values()) expect(count).toBe(1);
  }

  it.each([1, 7, 42, 2026])('FR-009-04 FR-009-18: invarianti ob semenu %i', (seed) => {
    const next = random(seed);
    let selection = emptySelection(GROUP);
    const universe = 12_000;
    const pick = (max: number) => Math.floor(next() * max);

    for (let step = 0; step < 300; step += 1) {
      const kind = pick(4);
      const start = pick(universe - 3_000);
      let change: SelectionChange;
      if (kind === 0) {
        change = toggle(selection, `k${pick(universe)}`);
      } else if (kind === 1) {
        change = setPage(selection, range(start, start + pick(60)), next() < 0.5);
      } else if (kind === 2) {
        change = addMatches(
          selection,
          params({ q: `q${pick(30)}` }),
          range(start, start + 1 + pick(2_500)),
        );
      } else {
        change = setPage(selection, range(start, start + pick(900)), false);
      }
      if (change.ok) selection = change.selection;
      assertInvariants(selection);
    }
  });
});
