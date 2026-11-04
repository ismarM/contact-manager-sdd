// FR-000-16: DECISIONS.md popiše shadcn/ui po vzorcih in vsa orodja ogrodja (constitution VII).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const decisions = readFileSync(path.join(root, 'DECISIONS.md'), 'utf8');
const rows = decisions
  .split('\n')
  .filter((line) => line.startsWith('| D-'))
  .map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    return { id: cells[1], type: cells[4], text: cells.slice(5).join('|') };
  });
const decisionText = rows.filter((r) => r.type === 'odločitev').map((r) => r.text).join('\n');

// Vzorci iz tabele design.md 13.4.
const patterns = [
  'Alert Dialog/Dialog',
  'Dropdown Menu',
  'Command/Combobox',
  'Sonner',
  'Checkbox/Radio Group',
  'Button/Input/Textarea/Label/Table/Separator',
  'Select',
  'Card/Sidebar/Tooltip/Carousel/Chart',
];

describe('DECISIONS.md', () => {
  it('FR-000-16: vsak vnos ima veljavno vrsto', () => {
    const valid = ['odločitev', 'sprememba-testa', 'utišanje', 'sprememba-specifikacije'];
    for (const row of rows) assert.ok(valid.includes(row.type), `${row.id}: neveljavna vrsta "${row.type}"`);
  });

  it('FR-000-16: odločitev o shadcn/ui izbere natanko en način za vsak vzorec iz design.md 13.4', () => {
    const entry = rows.find((r) => r.type === 'odločitev' && r.text.includes('shadcn/ui po vzorcih'));
    assert.ok(entry, 'manjka vnos »shadcn/ui po vzorcih«');
    for (const pattern of patterns) {
      const choices = [...entry.text.matchAll(new RegExp(`\\*${pattern.replace(/[/]/g, '\\/')}\\*: (nativni|shadcn)`, 'g'))];
      assert.equal(choices.length, 1, `vzorec ${pattern}: pričakovana natanko ena izbira »*${pattern}*: nativni|shadcn«`);
    }
  });

  it('FR-000-16: vsak paket npm ogrodja ima vnos vrste odločitev', () => {
    for (const project of ['frontend', 'e2e']) {
      const pkg = JSON.parse(readFileSync(path.join(root, project, 'package.json'), 'utf8'));
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        assert.ok(decisionText.includes(`\`${name}\``), `${project}: paket ${name} nima vnosa v DECISIONS.md`);
      }
    }
  });

  it('FR-000-16: vsaka odvisnost Maven ogrodja ima vnos vrste odločitev', () => {
    const pom = readFileSync(path.join(root, 'backend/pom.xml'), 'utf8');
    const dependencies = pom.slice(pom.indexOf('<dependencies>'), pom.indexOf('</dependencies>'));
    for (const [, artifact] of dependencies.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)) {
      assert.ok(decisionText.includes(`\`${artifact}\``), `backend: ${artifact} nima vnosa v DECISIONS.md`);
    }
  });
});
