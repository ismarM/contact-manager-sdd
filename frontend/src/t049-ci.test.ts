import { describe, expect, it } from 'vitest';

// T049 (FR-000-11): namerno padajoč test za preizkus CI; veja se po preizkusu izbriše.
describe('T049', () => {
  it('FR-000-11: namerno pade, da CI pokaže rdeč status in priloži verify-log', () => {
    expect(1).toBe(2);
  });
});
