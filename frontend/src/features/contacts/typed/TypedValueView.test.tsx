import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import '../../../i18n';

import { TypedValueView } from './TypedValueView';

// Prikaz vrednosti po tipu: povezave, golo besedilo, varnost (FR-016-03, FR-016-07).

describe('TypedValueView', () => {
  it('FR-016-03: e-naslov je povezava mailto', () => {
    render(<TypedValueView type="EMAIL" value="ana@primer.si" />);

    expect(screen.getByRole('link', { name: 'ana@primer.si' })).toHaveAttribute(
      'href',
      'mailto:ana@primer.si',
    );
  });

  it('FR-016-03: telefon je povezava tel', () => {
    render(<TypedValueView type="PHONE" value="+38641123456" />);

    expect(screen.getByRole('link', { name: '+386 41 123 456' })).toHaveAttribute(
      'href',
      'tel:+38641123456',
    );
  });

  it('FR-016-03: spletni naslov je https-povezava v novem zavihku z rel noopener noreferrer', () => {
    render(<TypedValueView type="URL" value="https://primer.si/pot" />);

    const link = screen.getByRole('link', { name: 'https://primer.si/pot' });
    expect(link).toHaveAttribute('href', 'https://primer.si/pot');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('FR-016-03: nevarna shema ni povezava, ampak besedilo', () => {
    render(<TypedValueView type="URL" value="javascript:alert(1)" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // getByText: nevarna povezava je prikazana kot golo besedilo brez vloge.
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('FR-016-07: opombe so golo besedilo z ohranjenimi presledki in vrsticami, oznake niso razlagane', async () => {
    const notes = '  <b>prva</b>\n\n    <img src=x onerror=alert(1)>';
    const { container } = render(<TypedValueView type="NOTES" value={notes} />);

    // querySelector b/img: ravno odsotnost razlaganih oznak HTML je predmet testa (getByRole teh elementov ne bi našel kot napako).
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // span: golo besedilo opomb nima vloge; preverja se dobesedna vsebina in ohranjeni presledki (whitespace-pre-wrap).
    const text = container.querySelector('span');
    expect(text?.textContent).toBe(notes);
    expect(text).toHaveClass('whitespace-pre-wrap');
    expect((await axe(container)).violations).toEqual([]);
  });

  it('FR-016-03: tip OTHER, DATE in ADDRESS je besedilo', () => {
    render(
      <>
        <TypedValueView type="OTHER" value="IT" />
        <TypedValueView type="DATE" value="2026-11-16" />
        <TypedValueView type="ADDRESS" value="Ulica 1" />
      </>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    for (const text of ['IT', '16/11/2026', 'Ulica 1']) {
      // getByText: prikazana vrednost je golo besedilo brez vloge.
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});
