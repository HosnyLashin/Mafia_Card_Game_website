import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ar, goOnline, lobbyState, setup } from './helpers.jsx';

const enterLobby = (env, overrides) => act(() => env.fire('room:state', lobbyState(overrides)));

describe('home screen', () => {
  it('shows connecting first and enables actions once online', () => {
    const env = setup();
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the server');
    expect(screen.getByRole('button', { name: 'Create room' })).toBeDisabled();
    act(() => goOnline(env));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create room' })).toBeEnabled();
  });

  it('asks for a name before creating a room', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
    expect(env.sent.filter((s) => s.event === 'room:create')).toHaveLength(0);
  });

  it('creates a room with the trimmed name and remembers it', async () => {
    const env = setup();
    act(() => goOnline(env));
    env.replies['room:create'] = { ok: true, code: 'KQTD' };
    await userEvent.type(screen.getByLabelText('Your name'), '  Hosny ');
    await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    await waitFor(() => expect(env.sent.some((s) => s.event === 'room:create')).toBe(true));
    expect(env.sent.find((s) => s.event === 'room:create').payload).toEqual({ name: 'Hosny' });
    expect(window.localStorage.getItem('mafia.name')).toBe('Hosny');
  });

  it('cleans the room code and only joins with four letters', async () => {
    const env = setup();
    act(() => goOnline(env));
    const input = screen.getByLabelText('Room code');
    const join = screen.getByRole('button', { name: 'Join room' });
    await userEvent.type(input, 'k1q-td9z');
    expect(input).toHaveValue('KQTD');
    expect(join).toBeEnabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'kq');
    expect(join).toBeDisabled();
  });

  it('joins a room and shows a translated server error', async () => {
    const env = setup();
    act(() => goOnline(env));
    env.replies['room:join'] = { error: 'ROOM_NOT_FOUND' };
    await userEvent.type(screen.getByLabelText('Your name'), 'Sam');
    await userEvent.type(screen.getByLabelText('Room code'), 'zzzz');
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No room matches that code.');
    expect(env.sent.find((s) => s.event === 'room:join').payload).toEqual({ code: 'ZZZZ', name: 'Sam' });
  });

  it('prefills the code from an invite link', () => {
    window.history.replaceState({}, '', '/?room=abcd');
    setup();
    expect(screen.getByLabelText('Room code')).toHaveValue('ABCD');
  });

  it('falls back to a generic message for unknown errors', async () => {
    const env = setup();
    act(() => goOnline(env));
    env.replies['room:create'] = { error: 'SOMETHING_NEW' };
    await userEvent.type(screen.getByLabelText('Your name'), 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('renders Arabic with right-to-left layout and a left-to-right code field', () => {
    setup({ lang: 'ar' });
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ar('app.name'));
    expect(screen.getByRole('button', { name: ar('home.create') })).toBeInTheDocument();
    expect(screen.getByLabelText(ar('home.join.label'))).toHaveAttribute('dir', 'ltr');
  });

  it('can switch language from the home screen', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'مصري' }));
    expect(screen.getByRole('button', { name: ar('home.create') })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('connection banner', () => {
  it('explains a slow first connection and later a lost connection', async () => {
    const { default: vi } = await import('vitest').then((m) => ({ default: m.vi }));
    vi.useFakeTimers();
    const env = setup();
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
    act(() => vi.advanceTimersByTime(4500));
    expect(screen.getByRole('status')).toHaveTextContent('waking up');
    act(() => goOnline(env));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => env.fire('disconnect'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
    vi.useRealTimers();
  });
});

describe('lobby screen', () => {
  it('shows the room code as four tiles and the players', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    expect(screen.getByRole('img', { name: 'Room code: KQTD' })).toBeInTheDocument();
    expect(screen.getByText('Hosny')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('3 / 6')).toBeInTheDocument();
    expect(screen.getAllByText('Host')).toHaveLength(1);
    expect(screen.getAllByText('Bot').length).toBeGreaterThan(0);
  });

  it('lets only the host remove human players', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    expect(screen.getByRole('button', { name: 'Remove Sam' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Hosny' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Bot 1' })).toBeNull();
    env.replies['room:kick'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));
    expect(env.sent.find((s) => s.event === 'room:kick').payload).toEqual({ playerId: 'g_sam' });
  });

  it('shows guests only a waiting message', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, { hostId: 'g_sam' });
    expect(screen.getByText('Waiting for the host to start the game.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('needs confirmation before starting with bots', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    expect(screen.getByText(/At least 6 players are needed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start with bots' }));
    expect(env.sent.filter((s) => s.event === 'room:start')).toHaveLength(0);
    expect(screen.getByText(/Bots fill the empty seats so the game has 6 players/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Start with bots' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start with bots' }));
    env.replies['room:start'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Add bots and start' }));
    expect(env.sent.find((s) => s.event === 'room:start').payload).toEqual({ fillWithBots: true });
  });

  it('starts normally when there are enough players', async () => {
    const env = setup();
    act(() => goOnline(env));
    const players = Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? 'g_me' : `g_${i}`, name: `P${i}`, isBot: false, connected: true, left: false }));
    await enterLobby(env, { players });
    env.replies['room:start'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }));
    expect(env.sent.find((s) => s.event === 'room:start').payload).toEqual({});
    expect(screen.queryByRole('button', { name: 'Start with bots' })).toBeNull();
  });

  it('leaves the room and returns home', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    env.replies['room:leave'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Leave room' }));
    expect(await screen.findByRole('button', { name: 'Create room' })).toBeInTheDocument();
  });

  it('tells a kicked player what happened and lets them dismiss it', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, { hostId: 'g_sam' });
    act(() => env.fire('room:kicked'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('The host removed you from the room.');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create room' })).toBeInTheDocument();
  });

  it('renders the lobby in Arabic with the code kept left to right', async () => {
    const env = setup({ lang: 'ar' });
    act(() => goOnline(env));
    await enterLobby(env);
    expect(screen.getByRole('img', { name: `${ar('lobby.code.label')}: KQTD` })).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('button', { name: ar('lobby.kick', { name: 'Sam' }) })).toBeInTheDocument();
    expect(screen.getByText(ar('lobby.host'))).toBeInTheDocument();
    expect(screen.getByText(ar('lobby.need', { min: 6 }))).toBeInTheDocument();
  });
});

describe('room size', () => {
  it('lets the host change the number of players within the limits', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    expect(screen.getByRole('group', { name: 'Number of players' })).toHaveTextContent('6');
    expect(screen.getByRole('button', { name: 'Fewer players' })).toBeDisabled();
    env.replies['room:settings'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'More players' }));
    expect(env.sent.find((s) => s.event === 'room:settings').payload).toEqual({ capacity: 7 });

    act(() => env.fire('room:state', lobbyState({ capacity: 12 })));
    expect(screen.getByRole('button', { name: 'More players' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fewer players' })).toBeEnabled();
    expect(screen.getByText('3 / 12')).toBeInTheDocument();
  });

  it('shows guests the size without the controls', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, { hostId: 'g_sam', capacity: 9 });
    expect(screen.getByRole('group', { name: 'Number of players' })).toHaveTextContent('9');
    expect(screen.queryByRole('button', { name: 'More players' })).toBeNull();
  });

  it('fills to the chosen size when starting with bots', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, { capacity: 9 });
    await userEvent.click(screen.getByRole('button', { name: 'Start with bots' }));
    expect(screen.getByText(/so the game has 9 players/)).toBeInTheDocument();
    env.replies['room:start'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Add bots and start' }));
    expect(env.sent.find((s) => s.event === 'room:start').payload).toEqual({ fillWithBots: true });
  });

  it('offers a normal start plus an optional bot fill once there are enough players', async () => {
    const env = setup();
    act(() => goOnline(env));
    const players = Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? 'g_me' : `g_${i}`, name: `P${i}`, isBot: false, connected: true, left: false }));
    await enterLobby(env, { players, capacity: 8 });
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fill empty seats with bots and start' }));
    expect(screen.getByText(/so the game has 8 players/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
  });

  it('has no bot fill when the room is full', async () => {
    const env = setup();
    act(() => goOnline(env));
    const players = Array.from({ length: 6 }, (_, i) => ({ id: i === 0 ? 'g_me' : `g_${i}`, name: `P${i}`, isBot: false, connected: true, left: false }));
    await enterLobby(env, { players, capacity: 6 });
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill empty seats with bots and start' })).toBeNull();
  });
});
