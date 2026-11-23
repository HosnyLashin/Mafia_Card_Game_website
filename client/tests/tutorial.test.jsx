import { describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ar, goOnline, setup } from './helpers.jsx';

describe('tutorial', () => {
  it('opens by itself on the first visit and remembers that it was closed', async () => {
    window.localStorage.removeItem('mafia.tutorialSeen');
    setup();
    expect(await screen.findByRole('dialog', { name: 'How to play' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem('mafia.tutorialSeen')).toBe('1');
  });

  it('does not open by itself again', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can be opened from the home screen and walked through step by step', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 1 of 7');
    expect(screen.getByRole('heading', { name: 'The goal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'The roles' })).toBeInTheDocument();
    ['Mafia:', 'Doctor:', 'Police:', 'Citizen:'].forEach((word) => expect(screen.getByText(new RegExp(`^${word}`))).toBeInTheDocument());

    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 7 of 7');
    expect(screen.getByRole('heading', { name: 'Winning' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'The trial' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Got it, let me play' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with the Escape key and starts again from step one', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: 'How to play' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Step 1 of 7');
  });

  it('explains the game in Egyptian Arabic', async () => {
    const env = setup({ lang: 'ar' });
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: ar('home.howto') }));
    expect(screen.getByRole('heading', { name: ar('tutorial.1.title') })).toBeInTheDocument();
    expect(screen.getByText(ar('tutorial.1.body'))).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent(ar('tutorial.progress', { step: 1, total: 7 }));
  });
});
