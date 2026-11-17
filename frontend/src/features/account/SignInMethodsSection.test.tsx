import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { i18n } from '../../i18n';
import { ANA, createAuthFake } from '../../test/authFake';
import { accountRegion, renderAccountApp } from '../../test/myDataApi';

const REGION = 'Prijavne metode';

describe('SignInMethodsSection (FR-017-09, -10, -11)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sl');
  });

  it('Google uporabnik: seznam kaže Google povezan, geslo ne; e-naslov je samo za branje', async () => {
    const { user } = renderAccountApp();
    const region = await accountRegion(REGION);
    expect(screen.getByRole('region', { name: REGION })).toHaveTextContent('Google: povezano');
    expect(screen.getByRole('region', { name: REGION })).toHaveTextContent(
      'E-naslov in geslo: ni povezano',
    );
    expect(within(region).queryByRole('button', { name: 'Dodaj Google' })).not.toBeInTheDocument();

    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));

    const email = within(region).getByLabelText('E-naslov');
    expect(email).toHaveValue('ana@primer.si');
    expect(email).toHaveAttribute('readonly');
    expect((await axe(document.body)).violations).toEqual([]);
  });

  const warning = /po dodajanju gesla zahteva, da znova potrdiš e-naslov/;

  async function fillNewPassword(
    user: ReturnType<typeof renderAccountApp>['user'],
    region: HTMLElement,
    agree = true,
  ) {
    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));
    await user.type(within(region).getByLabelText('Geslo'), 'geslo-12345678');
    await user.type(within(region).getByLabelText('Ponovi geslo'), 'geslo-12345678');
    if (agree) {
      await user.click(
        within(region).getByRole('checkbox', { name: /imam dostop do svojega e-poštnega predala/ }),
      );
    }
  }

  it('FR-017-11: opozorilo o ponovni potrditvi je vidno PRED dodajanjem, brez soglasja se ne zgodi nič', async () => {
    const { user, gateway } = renderAccountApp();
    const region = await accountRegion(REGION);
    await fillNewPassword(user, region, false);
    expect(within(region).getByRole('note')).toHaveTextContent(warning);
    expect((await axe(document.body)).violations).toEqual([]);

    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent('Potrdi, da razumeš');
    expect(gateway.reauthentications).toHaveLength(0);
    expect(gateway.links).toHaveLength(0);
  });

  it('FR-017-11: dodajanje gesla ponastavi potrditev → zaslon potrditve z razlago, sporočilo poslano, po potrditvi vstop z istim UID', async () => {
    const { user, gateway } = renderAccountApp();
    const region = await accountRegion(REGION);
    await fillNewPassword(user, region);
    const mailsBefore = gateway.verificationEmails;

    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Potrdi e-naslov' })).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent(
      'Račun, skupine in podatki so nespremenjeni.',
    );
    expect(gateway.reauthentications).toEqual(['google']);
    expect(gateway.links).toEqual(['password']);
    expect(gateway.verificationEmails).toBe(mailsBefore + 1);
    expect(gateway.currentUser?.uid).toBe('uid-ana');
    expect((await axe(document.body)).violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Ponovno pošlji' }));
    expect(gateway.verificationEmails).toBe(mailsBefore + 2);

    gateway.verifyEmail('ana@primer.si');
    await user.click(screen.getByRole('button', { name: 'Potrdil sem' }));
    await waitFor(() => expect(screen.getByRole('region', { name: REGION })).toBeVisible());
    expect(screen.getByRole('region', { name: REGION })).toHaveTextContent(
      'E-naslov in geslo: povezano',
    );
  });

  it('dodajanje gesla brez ponastavitve potrditve: seznam se osveži, ostanemo na strani', async () => {
    const gateway = createAuthFake({ user: ANA, linkResetsVerification: false });
    const { user } = renderAccountApp({}, { gateway });
    const region = await accountRegion(REGION);
    await fillNewPassword(user, region);

    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: REGION })).toHaveTextContent(
        'E-naslov in geslo: povezano',
      ),
    );
    expect(
      await within(screen.getByRole('region', { name: REGION })).findByRole('status'),
    ).toHaveTextContent('Geslo je dodano.');
  });

  it('prekratko geslo in neujemanje: napake ob poljih, nobenega klica ponudniku', async () => {
    const { user, gateway } = renderAccountApp();
    const region = await accountRegion(REGION);
    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));
    await user.type(within(region).getByLabelText('Geslo'), 'kratko');
    await user.type(within(region).getByLabelText('Ponovi geslo'), 'drugo');
    await user.click(within(region).getByRole('checkbox'));

    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));

    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'Geslo mora imeti najmanj 8 znakov.',
    );
    expect(gateway.reauthentications).toHaveLength(0);
    expect(gateway.links).toHaveLength(0);
  });

  it('preklicano pojavno okno Googla: sporočilo, geslo ni dodano', async () => {
    const { user, gateway } = renderAccountApp();
    const region = await accountRegion(REGION);
    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));
    await user.type(within(region).getByLabelText('Geslo'), 'geslo-12345678');
    await user.type(within(region).getByLabelText('Ponovi geslo'), 'geslo-12345678');
    await user.click(within(region).getByRole('checkbox'));
    gateway.failNextSignIn('cancelled');

    await user.click(within(region).getByRole('button', { name: 'Dodaj geslo' }));

    expect(await within(region).findByRole('alert')).toBeVisible();
    expect(gateway.links).toHaveLength(0);
    expect(screen.getByRole('region', { name: REGION })).toHaveTextContent(
      'E-naslov in geslo: ni povezano',
    );
  });

  async function passwordGateway() {
    const gateway = createAuthFake();
    gateway.addPasswordAccount('ana@primer.si', 'geslo-12345678');
    await gateway.signInWithPassword('ana@primer.si', 'geslo-12345678');
    return gateway;
  }

  it('uporabnik z geslom: Dodaj Google zahteva trenutno geslo, nato poveže', async () => {
    const gateway = await passwordGateway();
    const { user } = renderAccountApp({}, { gateway });
    const region = await accountRegion(REGION);
    expect(screen.getByRole('region', { name: REGION })).toHaveTextContent('Google: ni povezano');
    await user.click(within(region).getByRole('button', { name: 'Dodaj Google' }));
    await user.type(within(region).getByLabelText('Trenutno geslo'), 'geslo-12345678');

    await user.click(within(region).getByRole('button', { name: 'Poveži Google' }));

    await waitFor(() =>
      expect(screen.getByRole('region', { name: REGION })).toHaveTextContent('Google: povezano'),
    );
    expect(gateway.reauthentications).toEqual(['password']);
    expect(gateway.links).toEqual(['google']);
  });

  it('napačno trenutno geslo: napaka ob polju, Google ni povezan', async () => {
    const gateway = await passwordGateway();
    const { user } = renderAccountApp({}, { gateway });
    const region = await accountRegion(REGION);
    await user.click(within(region).getByRole('button', { name: 'Dodaj Google' }));
    await user.type(within(region).getByLabelText('Trenutno geslo'), 'napacno-geslo');

    await user.click(within(region).getByRole('button', { name: 'Poveži Google' }));

    const field = await within(region).findByLabelText('Trenutno geslo');
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription('E-naslov ali geslo ni pravilno.');
    expect(gateway.links).toHaveLength(0);
  });

  it('Google račun že pri drugem računu: jasno sporočilo, nič združeno', async () => {
    const gateway = await passwordGateway();
    const { user } = renderAccountApp({}, { gateway });
    const region = await accountRegion(REGION);
    await user.click(within(region).getByRole('button', { name: 'Dodaj Google' }));
    await user.type(within(region).getByLabelText('Trenutno geslo'), 'geslo-12345678');
    gateway.failNextSignIn('credential-in-use');

    await user.click(within(region).getByRole('button', { name: 'Poveži Google' }));

    // prvi klic (ponovna avtentikacija) porabi napako; povezovanje je enako zavrnjeno
    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'že povezan z drugim računom',
    );
    expect(gateway.currentUser?.providers).toEqual(['password']);
  });

  it('angleški vmesnik', async () => {
    localStorage.setItem('language', 'en');
    await i18n.changeLanguage('en');
    renderAccountApp();

    const region = await screen.findByRole('region', { name: 'Sign-in methods' });
    expect(within(region).getByRole('button', { name: 'Add password' })).toBeVisible();
  });
});
