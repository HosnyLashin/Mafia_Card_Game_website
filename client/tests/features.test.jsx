import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AVATARS as SERVER_AVATARS, COLORS as SERVER_COLORS } from '../../profile.js';
import { QUICK_EMOJI as SERVER_EMOJI, QUICK_PHRASES as SERVER_PHRASES } from '../../engine/quick.js';
import { AVATARS, COLORS } from '../src/profile.js';
import { QUICK_EMOJI, QUICK_PHRASES } from '../src/quick.js';
import { playCue } from '../src/settings/audio.js';
import { ar, gameView, goOnline, lobbyState, person, setup, withMe } from './helpers.jsx';

vi.mock('../src/settings/audio.js', () => ({ playCue: vi.fn() }));

const enterLobby = (env, overrides) => act(() => env.fire('room:state', lobbyState(overrides)));

async function enterGame(env, view, overrides = {}) {
  act(() => goOnline(env));
  act(() => env.fire('room:state', lobbyState({ phase: 'playing', ...overrides })));
  act(() => env.fire('game:view', view));
}

const sent = (env, event) => env.sent.filter((s) => s.event === event).map((s) => s.payload);

beforeEach(() => {
  vi.mocked(playCue).mockClear();
});

describe('shared lists', () => {
  it('matches the server avatar, color and quick message lists', () => {
    expect(AVATARS).toEqual(SERVER_AVATARS);
    expect(COLORS).toEqual(SERVER_COLORS);
    expect(QUICK_EMOJI).toEqual(SERVER_EMOJI);
    expect(QUICK_PHRASES).toEqual(SERVER_PHRASES);
  });
});

describe('settings', () => {
  it('toggles are saved and applied to the page', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Large' }));
    expect(document.documentElement.dataset.textSize).toBe('large');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Reduce motion' }));
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Sound effects' }));
    const saved = JSON.parse(window.localStorage.getItem('mafia.settings'));
    expect(saved).toMatchObject({ textSize: 'large', reduceMotion: true, sound: false, vibration: true });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('starts from the saved settings', () => {
    window.localStorage.setItem('mafia.settings', JSON.stringify({ textSize: 'xlarge', sound: false }));
    setup();
    expect(document.documentElement.dataset.textSize).toBe('xlarge');
  });

  it('plays a sound and vibrates on a new phase, unless turned off', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const env = setup();
    await enterGame(env, gameView());
    act(() => env.fire('game:view', gameView({ phase: 'report', me: { ...gameView().me, awaitingAction: false } })));
    expect(playCue).toHaveBeenCalledWith('morning');
    expect(vibrate).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Sound effects' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Vibration' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    playCue.mockClear();
    vibrate.mockClear();
    act(() => env.fire('game:view', gameView({ phase: 'vote', me: { ...gameView().me, awaitingAction: false } })));
    expect(playCue).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    delete navigator.vibrate;
  });

  it('plays the winning or losing sound at the end of a game', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'report' }));
    playCue.mockClear();
    act(() => env.fire('game:view', gameView({ phase: 'ended', winner: 'citizens', deadline: null, me: { ...gameView().me, awaitingAction: false } })));
    expect(playCue).toHaveBeenCalledWith('win');
  });

  it('can be opened in Egyptian Arabic', async () => {
    const env = setup({ lang: 'ar' });
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: ar('settings.open') }));
    expect(screen.getByRole('dialog', { name: ar('settings.title') })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: ar('settings.size.xlarge') })).toBeInTheDocument();
  });
});

describe('profile', () => {
  it('lets the player pick an avatar and color that are remembered and sent', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByText('Your look'));
    await userEvent.click(screen.getByRole('button', { name: AVATARS[6] }));
    await userEvent.click(screen.getByRole('button', { name: 'Purple' }));
    expect(JSON.parse(window.localStorage.getItem('mafia.profile'))).toEqual({ avatar: AVATARS[6], color: 'purple' });
    env.replies['room:create'] = { ok: true, code: 'KQTD' };
    await userEvent.type(screen.getByLabelText('Your name'), 'Hosny');
    await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    expect(sent(env, 'room:create')[0]).toEqual({ name: 'Hosny', avatar: AVATARS[6], color: 'purple' });
  });

  it('ignores a broken saved profile', () => {
    window.localStorage.setItem('mafia.profile', '{"avatar":"<b>","color":"neon"}');
    setup();
    expect(screen.getByText('Your look')).toBeInTheDocument();
  });

  it('shows avatars and colored names in the lobby', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    const rows = document.querySelectorAll('.players li');
    expect(rows[0].querySelector('.avatar')).toHaveTextContent('😀');
    expect(rows[1].querySelector('.name')).toHaveAttribute('data-color', 'red');
  });
});

describe('practice round and watching', () => {
  it('starts a practice round from the home screen', async () => {
    const env = setup();
    act(() => goOnline(env));
    env.replies['room:practice'] = { ok: true, code: 'KQTD' };
    await userEvent.type(screen.getByLabelText('Your name'), 'Learner');
    await userEvent.click(screen.getByRole('button', { name: 'Practice round' }));
    expect(sent(env, 'room:practice')[0]).toMatchObject({ name: 'Learner' });
  });

  it('shows a hint for the current phase and lets the player hide it', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'doctor' }), { practice: true });
    expect(screen.getByRole('note')).toHaveTextContent('You are the doctor');
    act(() => env.fire('game:view', gameView({ phase: 'vote' })));
    expect(screen.getByRole('note')).toHaveTextContent('Tap the player you think is the mafia');
    await userEvent.click(screen.getByRole('button', { name: 'Hide hints' }));
    expect(screen.queryByRole('note')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show hints' }));
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('has a different hint for every role at night and none outside practice', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'citizen', awaitingAction: false }), { practice: true });
    expect(screen.getByRole('note')).toHaveTextContent('nothing to do at night');
    const normal = setup();
    await enterGame(normal, gameView());
    expect(screen.queryAllByRole('note')).toHaveLength(1);
  });

  it('shows hints in Egyptian Arabic', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, withMe({ role: 'police' }), { practice: true });
    expect(screen.getByRole('note')).toHaveTextContent(ar('practice.hint.night.police'));
  });

  it('joins a room as a watcher when asked to', async () => {
    const env = setup();
    act(() => goOnline(env));
    env.replies['room:join'] = { ok: true, code: 'KQTD', spectator: true };
    await userEvent.type(screen.getByLabelText('Your name'), 'Friend');
    await userEvent.type(screen.getByLabelText('Room code'), 'kqtd');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Watch only, without playing' }));
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(sent(env, 'room:join')[0]).toMatchObject({ code: 'KQTD', spectator: true, name: 'Friend' });
  });

  it('shows watchers a read-only lobby', async () => {
    const env = setup();
    act(() => goOnline(env, 'g_watcher'));
    await enterLobby(env, { spectators: [{ id: 'g_watcher', name: 'Friend', avatar: '👻', color: 'pink' }] });
    expect(screen.getByText(/You are watching this room/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start game' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start with bots' })).toBeNull();
    expect(screen.queryByLabelText('Lobby chat: Write a message')).toBeNull();
    expect(screen.queryByLabelText('Room chat: Write a message')).toBeNull();
    expect(screen.getByText('Watching')).toBeInTheDocument();
  });

  it('lets the host remove a watcher', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, { spectators: [{ id: 'g_w', name: 'Friend', avatar: '👻', color: 'pink' }] });
    env.replies['room:kick'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Remove Friend' }));
    expect(sent(env, 'room:kick')[0]).toEqual({ playerId: 'g_w' });
  });

  it('shows watchers the game without secrets and without chat or voting', async () => {
    const env = setup();
    const view = {
      ...gameView({ phase: 'vote' }),
      spectator: true,
      me: { id: null, role: null, alive: false, awaitingAction: false, nightChoice: null, voteChoice: null },
    };
    act(() => goOnline(env, 'g_watcher'));
    act(() => env.fire('room:state', lobbyState({ phase: 'playing', spectators: [{ id: 'g_watcher', name: 'Friend', avatar: '👻', color: 'pink' }] })));
    act(() => env.fire('game:view', view));
    expect(screen.getAllByText(/You are watching. You cannot see secret roles/).length).toBeGreaterThan(0);
    expect(document.querySelector('.picker')).toBeNull();
    expect(screen.queryByText('Dead chat')).toBeNull();
    expect(screen.getByText('Watching', { selector: '.role-chip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows watchers the trial tally and the final result without a verdict', async () => {
    const env = setup();
    const base = {
      spectator: true,
      me: { id: null, role: null, alive: false, awaitingAction: false, nightChoice: null, voteChoice: null },
    };
    act(() => goOnline(env, 'g_watcher'));
    act(() => env.fire('room:state', lobbyState({ phase: 'playing' })));
    act(() => env.fire('game:view', { ...gameView({ phase: 'result', voteResult: { counts: { g_b: 2 }, accusedId: 'g_b', tie: false }, accused: 'g_b' }), ...base }));
    expect(screen.getByRole('status')).toHaveTextContent('Dana got the most votes');
    act(() => env.fire('game:view', { ...gameView({ phase: 'ended', winner: 'mafia', deadline: null, recap: [] }), ...base, players: gameView().players.map((p) => ({ ...p, role: 'citizen' })) }));
    expect(screen.getByRole('heading', { name: 'The mafia wins!' })).toBeInTheDocument();
    expect(screen.queryByText('You won.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull();
  });
});

describe('game rules', () => {
  it('lets the host change the timers, mafia count and options', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    env.replies['room:settings'] = { ok: true };
    await userEvent.selectOptions(screen.getByLabelText('Discussion time'), '60');
    await userEvent.selectOptions(screen.getByLabelText('Night time'), '45');
    await userEvent.selectOptions(screen.getByLabelText('Voting time'), '20');
    await userEvent.click(screen.getByLabelText('Show who voted for whom'));
    await userEvent.click(screen.getByLabelText('Show the role of dead players'));
    expect(sent(env, 'room:settings')).toEqual([
      { discussionSeconds: 60 },
      { nightSeconds: 45 },
      { voteSeconds: 20 },
      { publicVotes: true },
      { revealDeadRoles: false },
    ]);
  });

  it('offers only as many mafia as the room size allows', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, { capacity: 6 });
    const options = (select) => within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options(screen.getByLabelText('Number of mafia'))).toEqual(['Automatic', '1']);
    act(() => env.fire('room:state', lobbyState({ capacity: 12 })));
    expect(options(screen.getByLabelText('Number of mafia'))).toEqual(['Automatic', '1', '2', '3']);
    env.replies['room:settings'] = { ok: true };
    await userEvent.selectOptions(screen.getByLabelText('Number of mafia'), '2');
    expect(sent(env, 'room:settings').at(-1)).toEqual({ mafiaCount: 2 });
  });

  it('shows guests the rules without the controls', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env, {
      hostId: 'g_sam',
      settings: { discussionSeconds: 90, nightSeconds: null, voteSeconds: 45, mafiaCount: 2, publicVotes: true, revealDeadRoles: false },
    });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByLabelText('Discussion time')).toHaveTextContent('90 s');
    expect(screen.getByLabelText('Night time')).toHaveTextContent('30 s');
    expect(screen.getByLabelText('Number of mafia')).toHaveTextContent('2');
    expect(screen.getByLabelText('Show who voted for whom')).toHaveTextContent('Yes');
    expect(screen.getByLabelText('Show the role of dead players')).toHaveTextContent('No');
  });

  it('explains a refused setting', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    env.replies['room:settings'] = { error: 'INVALID_SETTING' };
    await userEvent.selectOptions(screen.getByLabelText('Night time'), '45');
    expect(await screen.findByRole('alert')).toHaveTextContent('That setting is not allowed.');
  });

  it('shows the rules in Egyptian Arabic', async () => {
    const env = setup({ lang: 'ar' });
    act(() => goOnline(env));
    await enterLobby(env);
    expect(screen.getByLabelText(ar('rules.discussion'))).toBeInTheDocument();
    expect(screen.getByLabelText(ar('rules.publicVotes'))).toBeInTheDocument();
  });

  it('shows who voted for whom when the host made votes public', async () => {
    const env = setup();
    await enterGame(env, withMe({ awaitingAction: false }, {
      phase: 'result',
      voteResult: { counts: { g_b: 2 }, accusedId: 'g_b', tie: false, voters: { g_b: ['g_a', 'g_c'] } },
      voteCounts: { g_b: 2 },
      accused: 'g_b',
    }));
    expect(screen.getByText('Amir، Lina')).toBeInTheDocument();
  });
});

describe('chat extras', () => {
  it('has a chat and quick messages in the lobby', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    env.replies['chat:send'] = { ok: true };
    env.replies['chat:quick'] = { ok: true };
    await userEvent.type(screen.getByLabelText('Room chat: Write a message'), 'hi all{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Hello everyone!' }));
    await userEvent.click(screen.getByRole('button', { name: '😂' }));
    expect(sent(env, 'chat:send')).toEqual([{ text: 'hi all' }]);
    expect(sent(env, 'chat:quick')).toEqual([{ id: 'hello' }, { id: '😂' }]);
  });

  it('shows quick messages in the language of each reader', async () => {
    const env = setup({ lang: 'ar' });
    act(() => goOnline(env));
    await enterLobby(env);
    act(() => env.fire('chat:message', { id: 1, playerId: 'g_sam', name: 'Sam', text: null, quick: 'goodluck', channel: 'main', day: 0, phase: 'lobby', at: 1 }));
    act(() => env.fire('chat:message', { id: 2, playerId: 'g_sam', name: 'Sam', text: null, quick: '🤔', channel: 'main', day: 0, phase: 'lobby', at: 2 }));
    const chat = screen.getByRole('region', { name: ar('lobby.chatTitle') });
    const bubbles = [...chat.querySelectorAll('.msg')];
    expect(bubbles[0]).toHaveTextContent(ar('quick.goodluck'));
    expect(bubbles[1].querySelector('.big-emoji')).toHaveTextContent('🤔');
  });

  it('puts avatars next to chat messages', async () => {
    const env = setup();
    act(() => goOnline(env));
    await enterLobby(env);
    act(() => env.fire('chat:message', { id: 1, playerId: 'g_sam', name: 'Sam', text: 'yo', channel: 'main', day: 0, phase: 'lobby', at: 1 }));
    const message = screen.getByText('yo').closest('li');
    expect(message.querySelector('.avatar')).toHaveTextContent('🦊');
    expect(message.querySelector('.msg-name')).toHaveAttribute('data-color', 'red');
  });

  it('gives the mafia a private night chat when they have a partner', async () => {
    const env = setup();
    const players = gameView().players.map((p) => (['g_me', 'g_a'].includes(p.id) ? { ...p, role: 'mafia' } : p));
    await enterGame(env, withMe({ role: 'mafia' }, { players }));
    expect(screen.getByRole('region', { name: 'Mafia chat' })).toBeInTheDocument();
    expect(screen.getByText('Only your fellow mafia can see this chat.')).toBeInTheDocument();
    act(() => env.fire('chat:history', [
      { id: 1, playerId: 'g_a', name: 'Amir', text: 'go for Dana', channel: 'mafia', day: 1, phase: 'night', at: 1 },
      { id: 2, playerId: 'g_c', name: 'Lina', text: 'town talk', channel: 'main', day: 1, phase: 'discussion', at: 2 },
    ]));
    const chat = screen.getByRole('region', { name: 'Mafia chat' });
    expect(within(chat).getByText('go for Dana')).toBeInTheDocument();
    expect(within(chat).queryByText('town talk')).toBeNull();
    env.replies['chat:send'] = { ok: true };
    await userEvent.type(screen.getByLabelText('Mafia chat: Write a message'), 'agreed{Enter}');
    expect(sent(env, 'chat:send')).toEqual([{ text: 'agreed' }]);
  });

  it('gives no night chat to a lone mafia member or to the town', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'mafia' }, { players: gameView().players.map((p) => (p.id === 'g_me' ? { ...p, role: 'mafia' } : p)) }));
    expect(screen.queryByRole('region', { name: 'Mafia chat' })).toBeNull();
    act(() => env.fire('game:view', withMe({ role: 'citizen', awaitingAction: false })));
    expect(screen.queryByRole('region', { name: 'Mafia chat' })).toBeNull();
  });

  it('shows the planning line a bot mafia member says', async () => {
    const env = setup();
    const players = gameView().players.map((p) => (['g_me', 'g_a'].includes(p.id) ? { ...p, role: 'mafia' } : p));
    const roomPlayers = players.map((p) => ({ id: p.id, name: p.name, isBot: false, connected: true, left: false, avatar: '😀', color: 'teal' }));
    await enterGame(env, withMe({ role: 'mafia' }, { players }), { players: roomPlayers });
    act(() => env.fire('chat:message', { id: 1, playerId: 'g_a', name: 'Amir', text: null, channel: 'mafia', template: { key: 'plan', variant: 2, params: { target: 'g_b' } }, day: 1, phase: 'night', at: 1 }));
    expect(screen.getByText('My pick for tonight is Dana.')).toBeInTheDocument();
  });
});

describe('end of game', () => {
  const recap = [
    { day: 1, mafiaPick: 'g_b', doctorPick: 'g_b', policeSuspect: 'g_a', policeResult: 'wrong', victimId: null, saved: true, vote: { counts: { g_c: 2 }, accusedId: 'g_c', tie: false }, outcome: 'kicked', kickedId: 'g_c' },
    { day: 2, mafiaPick: 'g_a', doctorPick: null, policeSuspect: null, policeResult: 'none', victimId: 'g_a', saved: false, vote: { counts: {}, accusedId: null, tie: true }, outcome: 'tie', kickedId: null },
    { day: 3, mafiaPick: null, doctorPick: 'g_me', policeSuspect: 'g_b', policeResult: 'right', victimId: null, saved: false, vote: null, outcome: null, kickedId: null },
  ];
  const ended = (rest = {}) =>
    gameView({ phase: 'ended', winner: 'citizens', deadline: null, recap, me: { ...gameView().me, awaitingAction: false }, ...rest });

  it('shows what happened every night and day', async () => {
    const env = setup();
    await enterGame(env, ended());
    const box = screen.getByRole('region', { name: 'Game recap' });
    expect(within(box).getByText('Night 1')).toBeInTheDocument();
    expect(within(box).getByText('The mafia chose Dana.')).toBeInTheDocument();
    expect(within(box).getByText('The doctor protected Dana.')).toBeInTheDocument();
    expect(within(box).getByText('The police checked Amir: wrong.')).toBeInTheDocument();
    expect(within(box).getByText('The doctor saved Dana!')).toBeInTheDocument();
    expect(within(box).getByText('Lina was voted out.')).toBeInTheDocument();
    expect(within(box).getByText('Amir was killed.')).toBeInTheDocument();
    expect(within(box).getByText('The vote was tied.')).toBeInTheDocument();
    expect(within(box).getByText('The mafia chose nobody.')).toBeInTheDocument();
    expect(within(box).getByText('The police checked nobody.')).toBeInTheDocument();
    expect(within(box).getByText('The doctor protected nobody.')).toBeInTheDocument();
    expect(within(box).getByText('The police checked Dana: right.')).toBeInTheDocument();
    expect(within(box).getAllByText('Nobody died.')).toHaveLength(1);
  });

  it('shows the recap in Egyptian Arabic', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, ended());
    const box = screen.getByRole('region', { name: ar('recap.title') });
    expect(within(box).getByText(ar('recap.mafia', { name: 'Dana' }))).toBeInTheDocument();
    expect(within(box).getByText(ar('recap.police', { name: 'Amir', result: ar('recap.wrong') }))).toBeInTheDocument();
  });

  it('lets the host start another game with the same players', async () => {
    const env = setup();
    await enterGame(env, ended());
    env.replies['room:rematch'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(sent(env, 'room:rematch')).toHaveLength(1);
    env.replies['room:lobby'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    expect(sent(env, 'room:lobby')).toHaveLength(1);
  });

  it('shows a guest only a waiting message', async () => {
    const env = setup();
    await enterGame(env, ended(), { hostId: 'g_sam' });
    expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull();
    expect(screen.getByText('Waiting for the host to return to the lobby.')).toBeInTheDocument();
  });
});

describe('replaced for being away', () => {
  it('tells a player a bot took their seat after they were inactive', async () => {
    const env = setup();
    await enterGame(env, gameView());
    act(() => env.fire('room:replaced', { reason: 'inactive' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('You were away for too long, so a bot took your seat.');
    expect(screen.getByRole('button', { name: 'Create room' })).toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('has a skip link to the main content', () => {
    setup();
    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveAttribute('href', '#main');
    expect(document.getElementById('main')).not.toBeNull();
  });

  it('announces each new phase and when it is the player’s turn', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'doctor' }));
    const announcer = screen.getByTestId('announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveTextContent('Night, day 1. It is your turn.');
    act(() => env.fire('game:view', gameView({ phase: 'report', me: { ...gameView().me, awaitingAction: false } })));
    expect(announcer).toHaveTextContent('Morning report, day 1');
    expect(announcer).not.toHaveTextContent('your turn');
  });

  it('announces phases in Egyptian Arabic', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, gameView({ phase: 'discussion', me: { ...gameView().me, awaitingAction: false } }));
    expect(screen.getByTestId('announcer')).toHaveTextContent(ar('a11y.phase', { phase: ar('phase.discussion'), day: 1 }));
  });

  it('labels the countdown as a timer', async () => {
    const env = setup();
    await enterGame(env, gameView());
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
  });

  it('keeps keyboard focus inside an open dialog', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toHaveFocus();
    const inside = dialog.querySelectorAll('input, button');
    inside[inside.length - 1].focus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('turns off motion when the operating system asks for it', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} });
    setup();
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);
    delete window.matchMedia;
  });

  it('gives every icon button a name', async () => {
    const env = setup();
    act(() => goOnline(env));
    await userEvent.click(screen.getByText('Your look'));
    document.querySelectorAll('.avatar-choice, .color-choice, .icon-button').forEach((button) => {
      expect(button.getAttribute('aria-label')).toBeTruthy();
    });
  });
});
