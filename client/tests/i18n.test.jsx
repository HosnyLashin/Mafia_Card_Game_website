import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { languages } from '../src/i18n/languages.js';
import { I18nProvider, translate, useI18n } from '../src/i18n/index.jsx';
import LanguageSwitcher from '../src/components/LanguageSwitcher.jsx';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('translation files', () => {
  const base = languages.en.messages;

  it.each(Object.keys(languages))('%s has exactly the same keys as English', (code) => {
    const keys = Object.keys(languages[code].messages).sort();
    expect(keys).toEqual(Object.keys(base).sort());
  });

  it.each(Object.keys(languages))('%s keeps the same placeholders as English', (code) => {
    for (const [key, text] of Object.entries(languages[code].messages)) {
      expect(placeholders(text), key).toEqual(placeholders(base[key]));
    }
  });

  it.each(Object.keys(languages))('%s has no empty text', (code) => {
    for (const [key, text] of Object.entries(languages[code].messages)) {
      expect(text.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('has an error message for every server error code used by the lobby', () => {
    const codes = ['INVALID_NAME', 'NAME_TAKEN', 'ROOM_NOT_FOUND', 'ROOM_FULL', 'GAME_STARTED', 'NOT_HOST', 'NOT_ENOUGH_PLAYERS', 'OFFLINE', 'TIMEOUT'];
    codes.forEach((code) => expect(base[`errors.${code}`], code).toBeTruthy());
  });

  it('uses Egyptian wording in the Arabic text', () => {
    const ar = languages.ar.messages;
    expect(ar['home.create']).toContain('أوضة');
    expect(ar['night.sleep']).toContain('نايمة');
  });

  it('declares a direction for every language', () => {
    Object.values(languages).forEach((language) => expect(['ltr', 'rtl']).toContain(language.dir));
    expect(languages.ar.dir).toBe('rtl');
  });
});

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'lobby.count', { count: 3, capacity: 6 })).toBe('3 / 6');
    expect(translate('ar', 'game.day', { day: 2 })).toContain('2');
    expect(translate('ar', 'game.day', { day: 2 })).not.toContain('{');
  });

  it('falls back to English and then to the key', () => {
    expect(translate('xx', 'home.create')).toBe('Create room');
    expect(translate('en', 'no.such.key')).toBe('no.such.key');
  });

  it('keeps unknown placeholders visible', () => {
    expect(translate('en', 'lobby.kick', {})).toBe('Remove {name}');
  });
});

describe('language provider', () => {
  function Probe() {
    const { t } = useI18n();
    return <p>{t('home.create')}</p>;
  }

  it('switches language, direction and remembers the choice', async () => {
    const memory = new Map();
    const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
    render(
      <I18nProvider initial="en" storage={storage}>
        <LanguageSwitcher />
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.dir).toBe('ltr');
    await userEvent.click(screen.getByRole('button', { name: 'مصري' }));
    expect(screen.getByText(translate('ar', 'home.create'))).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(memory.get('mafia.lang')).toBe('ar');
    await act(async () => userEvent.click(screen.getByRole('button', { name: 'English' })));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('starts from the saved language', () => {
    const storage = { getItem: () => 'ar', setItem: () => {} };
    render(
      <I18nProvider storage={storage}>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText(translate('ar', 'home.create'))).toBeInTheDocument();
  });
});

describe('bot chat lines', () => {
  it('has every line the bots can say in every language', async () => {
    const { LINE_CATEGORIES, LINE_VARIANTS } = await import('../../engine/botlines.js');
    for (const code of Object.keys(languages)) {
      for (const category of LINE_CATEGORIES) {
        for (let variant = 0; variant < LINE_VARIANTS; variant++) {
          expect(languages[code].messages[`bot.say.${category}.${variant}`], `${code} ${category} ${variant}`).toBeTruthy();
        }
      }
    }
  });

  it('uses {target} only for lines that name a player', async () => {
    const { LINE_CATEGORIES, LINE_VARIANTS } = await import('../../engine/botlines.js');
    const named = new Set(['mourn', 'suspect', 'quiet', 'agree', 'ask', 'sure', 'vouch', 'counter']);
    for (const category of LINE_CATEGORIES) {
      for (let variant = 0; variant < LINE_VARIANTS; variant++) {
        const text = languages.en.messages[`bot.say.${category}.${variant}`];
        expect(text.includes('{target}'), `${category} ${variant}`).toBe(named.has(category));
      }
    }
  });
});
