import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describeEvent } from '../src/components/EventLog.jsx';
import { translate } from '../src/i18n/index.jsx';
import { gameView, goOnline, lobbyState, person, setup, withMe } from './helpers.jsx';

async function enterGame(env, view, { hostId = 'g_me' } = {}) {
  act(() => goOnline(env));
  act(() => env.fire('room:state', lobbyState({ phase: 'playing', hostId })));
  act(() => env.fire('game:view', view));
}

const actions = (env) => env.sent.filter((s) => s.event === 'game:action').map((s) => s.payload.action);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('night', () => {
  it('lets the mafia pick a victim but never themselves or a partner', async () => {
    const env = setup();
    const view = withMe({ role: 'mafia' }, {
      players: gameView().players.map((p) => (p.id === 'g_me' ? { ...p, role: 'mafia' } : p.id === 'g_a' ? { ...p, role: 'mafia' } : p)),
    });
    await enterGame(env, view);
    expect(screen.getByText('Choose who to eliminate tonight.')).toBeInTheDocument();
    const picker = screen.getByRole('list', { name: '' });
    expect(within(picker).queryByRole('button', { name: /Hosny/ })).toBeNull();
    expect(within(picker).queryByRole('button', { name: /Amir/ })).toBeNull();
    env.replies['game:action'] = { ok: true };
    await userEvent.click(within(picker).getByRole('button', { name: /Dana/ }));
    expect(actions(env)).toEqual([{ type: 'night', target: 'g_b' }]);
  });

  it('lets the doctor choose themselves', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'doctor' }));
    expect(screen.getByText(/You can choose yourself/)).toBeInTheDocument();
    env.replies['game:action'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: /Hosny/ }));
    expect(actions(env)).toEqual([{ type: 'night', target: 'g_me' }]);
  });

  it('keeps the police from choosing themselves', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'police' }));
    expect(screen.queryByRole('button', { name: /Hosny/ })).toBeNull();
    expect(screen.getByText('Choose who to investigate tonight.')).toBeInTheDocument();
  });

  it('gives citizens the same kind of screen, with a harmless pick', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'citizen' }));
    expect(screen.getByText(/The town sleeps/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Amir|Dana|Lina|Omar|Sara/ })).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Do nothing tonight' })).toBeInTheDocument();
  });

  it('shows the role card on the first night only', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'police' }));
    expect(screen.getByLabelText('Your role', { selector: 'section' })).toHaveTextContent('Police');
    act(() => env.fire('game:view', withMe({ role: 'police' }, { day: 2 })));
    expect(screen.queryByLabelText('Your role', { selector: 'section' })).toBeNull();
  });

  it('confirms a locked choice, a skipped night and lets the player skip', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'doctor', awaitingAction: false, nightChoice: 'g_a' }));
    expect(screen.getByRole('button', { name: /Amir/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('locked in');
    act(() => env.fire('game:view', withMe({ role: 'doctor', awaitingAction: false, nightChoice: null })));
    expect(screen.getByRole('status')).toHaveTextContent('do nothing');
    env.replies['game:action'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Do nothing tonight' }));
    expect(actions(env)).toEqual([{ type: 'night', target: null }]);
  });

  it('shows a translated error when the server refuses an action', async () => {
    const env = setup();
    await enterGame(env, withMe({ role: 'doctor' }));
    env.replies['game:action'] = { error: 'WRONG_PHASE' };
    await userEvent.click(screen.getByRole('button', { name: /Amir/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That is not possible right now.');
  });

  it('turns dead players into spectators who see every role', async () => {
    const env = setup();
    const players = gameView().players.map((p) => ({ ...p, role: p.id === 'g_a' ? 'mafia' : 'citizen' }));
    await enterGame(env, withMe({ alive: false, awaitingAction: false }, { players }));
    expect(screen.getByText(/You are out of the game/)).toBeInTheDocument();
    expect(screen.getByText('Mafia', { selector: '.strip .pill' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Do nothing/ })).toBeNull();
  });
});

describe('morning report', () => {
  const events = [
    { seq: 0, day: 1, key: 'night.died', params: { playerId: 'g_b', role: 'police' } },
    { seq: 1, day: 1, key: 'police.right', params: {} },
  ];

  it('announces the victim, their role and the public police result', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'report', events }));
    const report = screen.getByLabelText('Morning report', { selector: 'section' });
    expect(report).toHaveTextContent('Dana was killed in the night. Role: Police');
    expect(report).toHaveTextContent('The police suspected the right person.');
  });

  it('says when nobody died and ignores older days', async () => {
    const env = setup();
    const quiet = [
      { seq: 0, day: 1, key: 'night.died', params: { playerId: 'g_b', role: 'police' } },
      { seq: 1, day: 2, key: 'night.nobody_died', params: {} },
      { seq: 2, day: 2, key: 'police.wrong', params: {} },
    ];
    await enterGame(env, gameView({ phase: 'report', day: 2, events: quiet }));
    const report = screen.getByLabelText('Morning report', { selector: 'section' });
    expect(report).toHaveTextContent('Nobody died tonight.');
    expect(report).toHaveTextContent('wrong person');
    expect(report).not.toHaveTextContent('Dana');
  });
});

describe('discussion chat', () => {
  it('lets living players write and clears the box after sending', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'discussion', me: { ...gameView().me, awaitingAction: false } }));
    env.replies['chat:send'] = { ok: true };
    const box = screen.getByLabelText('Write a message');
    await userEvent.type(box, '  I suspect Dana ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(env.sent.find((s) => s.event === 'chat:send').payload).toEqual({ text: 'I suspect Dana' });
    expect(box).toHaveValue('');
  });

  it('keeps the text and explains when the server refuses a message', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'discussion' }));
    env.replies['chat:send'] = { error: 'CHAT_RATE_LIMITED' };
    const box = screen.getByLabelText('Write a message');
    await userEvent.type(box, 'hello{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('too fast');
    expect(box).toHaveValue('hello');
  });

  it('does not send empty messages', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'discussion' }));
    await userEvent.type(screen.getByLabelText('Write a message'), '   {Enter}');
    expect(env.sent.some((s) => s.event === 'chat:send')).toBe(false);
  });

  it('shows messages with day dividers and marks your own', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'discussion', day: 2 }));
    act(() => env.fire('chat:history', [
      { id: 1, playerId: 'g_a', name: 'Amir', text: 'morning', day: 1, phase: 'discussion', at: 1 },
      { id: 2, playerId: 'g_me', name: 'Hosny', text: 'hi all', day: 2, phase: 'discussion', at: 2 },
    ]));
    expect(screen.getByText('Day 1', { selector: '.chat-day' })).toBeInTheDocument();
    expect(screen.getByText('Day 2', { selector: '.chat-day' })).toBeInTheDocument();
    expect(screen.getByText('hi all').closest('li')).toHaveClass('mine');
    expect(screen.getByText('morning').closest('li')).not.toHaveClass('mine');
    act(() => env.fire('chat:message', { id: 3, playerId: 'g_b', name: 'Dana', text: 'new one', day: 2, phase: 'discussion', at: 3 }));
    expect(screen.getByText('new one')).toBeInTheDocument();
  });

  it('shows dead players the chat without a way to write', async () => {
    const env = setup();
    await enterGame(env, withMe({ alive: false, awaitingAction: false }, { phase: 'discussion' }));
    expect(screen.queryByLabelText('Write a message')).toBeNull();
    expect(screen.getByText(/You can read the chat but not write/)).toBeInTheDocument();
  });

  it('renders message text as plain text', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'discussion' }));
    act(() => env.fire('chat:message', { id: 1, playerId: 'g_a', name: 'Amir', text: '<img src=x onerror=alert(1)>', day: 1, phase: 'discussion', at: 1 }));
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('.chat-list img')).toBeNull();
  });
});

describe('vote', () => {
  it('lets a player vote for someone else and skip', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'vote' }));
    expect(screen.queryByRole('button', { name: /Hosny/ })).toBeNull();
    env.replies['game:action'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: /Lina/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Skip the vote' }));
    expect(actions(env)).toEqual([{ type: 'vote', target: 'g_c' }, { type: 'vote', target: null }]);
  });

  it('highlights a locked vote and offers no vote to the dead', async () => {
    const env = setup();
    await enterGame(env, withMe({ awaitingAction: false, voteChoice: 'g_c' }, { phase: 'vote' }));
    expect(screen.getByRole('button', { name: /Lina/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('locked in');
    act(() => env.fire('game:view', withMe({ alive: false, awaitingAction: false }, { phase: 'vote' })));
    expect(screen.getByText(/watching the vote/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lina/ })).toBeNull();
  });
});

describe('trial', () => {
  const trial = (phase, me = {}, rest = {}) =>
    withMe(me, { phase, accused: 'g_b', voteCounts: { g_b: 3, g_a: 1 }, ...rest });

  it('lets only the accused speak during the defense and shows the tally', async () => {
    const env = setup();
    await enterGame(env, trial('defense'));
    expect(screen.getByRole('heading', { name: 'Dana is on trial' })).toBeInTheDocument();
    expect(screen.getByLabelText('Votes: 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Write a message')).toBeNull();
    expect(screen.getByText('Only the accused can speak now.')).toBeInTheDocument();
    act(() => env.fire('game:view', trial('defense', { id: 'g_b' }, { me: { ...gameView().me, id: 'g_b', role: 'citizen', alive: true, awaitingAction: false } })));
    expect(screen.getByText(/Explain why you are not the mafia/)).toBeInTheDocument();
    expect(screen.getByLabelText('Write a message')).toBeInTheDocument();
  });

  it('lets voters of the accused keep or switch', async () => {
    const env = setup();
    await enterGame(env, trial('revote', {}, { canRevote: true }));
    expect(screen.getByText('Do you still think Dana is the mafia?')).toBeInTheDocument();
    env.replies['game:action'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Switch and spare Dana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep my vote' }));
    expect(actions(env)).toEqual([{ type: 'revote', choice: 'switch' }, { type: 'revote', choice: 'keep' }]);
    expect(screen.getByRole('button', { name: 'Keep my vote' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('tells everyone else to wait for the voters', async () => {
    const env = setup();
    await enterGame(env, trial('revote', {}, { canRevote: false }));
    expect(screen.getByText('The people who voted for Dana are deciding.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep my vote' })).toBeNull();
  });
});

describe('game over', () => {
  const finished = (overrides = {}) =>
    gameView({
      phase: 'ended',
      deadline: null,
      winner: 'citizens',
      me: { ...gameView().me, awaitingAction: false },
      players: gameView().players.map((p, i) => ({ ...p, role: i === 1 ? 'mafia' : 'citizen', alive: i !== 2 })),
      events: [{ seq: 0, day: 3, key: 'game.over', params: { winner: 'citizens', reason: 'mafia_eliminated' } }],
      ...overrides,
    });

  it('shows the winner, the reason, the verdict and every role', async () => {
    const env = setup();
    await enterGame(env, finished());
    expect(screen.getByRole('heading', { name: 'The citizens win!' })).toBeInTheDocument();
    expect(screen.getByText('Every member of the mafia was voted out.')).toBeInTheDocument();
    expect(screen.getByText('You won.')).toBeInTheDocument();
    expect(screen.getByText('Mafia', { selector: '.players .pill' })).toBeInTheDocument();
    expect(document.querySelector('.countdown')).toBeNull();
  });

  it('tells a mafia player the loss', async () => {
    const env = setup();
    await enterGame(env, finished({ me: { ...gameView().me, role: 'mafia', awaitingAction: false } }));
    expect(screen.getByText('You lost.')).toBeInTheDocument();
  });

  it('lets only the host return everyone to the lobby', async () => {
    const env = setup();
    await enterGame(env, finished());
    env.replies['room:lobby'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    expect(env.sent.some((s) => s.event === 'room:lobby')).toBe(true);

    const guest = setup();
    await enterGame(guest, finished(), { hostId: 'g_a' });
    expect(within(document.body).getAllByText('Waiting for the host to return to the lobby.').length).toBeGreaterThan(0);
  });

  it('returns to the lobby screen when the room goes back to the lobby', async () => {
    const env = setup();
    await enterGame(env, finished());
    act(() => env.fire('room:state', lobbyState({ phase: 'lobby' })));
    expect(screen.getByRole('img', { name: 'Room code: KQTD' })).toBeInTheDocument();
  });
});

describe('Arabic game screens', () => {
  it('shows the night prompt and role chip in Arabic', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, withMe({ role: 'police' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('الليل');
    expect(screen.getByText('اختر من تريد التحقيق معه الليلة.')).toBeInTheDocument();
    expect(screen.getByText('الشرطي', { selector: '.role-chip' })).toBeInTheDocument();
  });

  it('shows the morning report in Arabic', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, gameView({ phase: 'report', events: [
      { seq: 0, day: 1, key: 'night.died', params: { playerId: 'g_b', role: 'doctor' } },
      { seq: 1, day: 1, key: 'police.wrong', params: {} },
    ] }));
    const report = screen.getByLabelText('تقرير الصباح', { selector: 'section' });
    expect(report).toHaveTextContent('تم قتل Dana في الليل. الدور: الطبيب');
    expect(report).toHaveTextContent('اشتبه الشرطي بالشخص الخطأ.');
  });
});

describe('alerts', () => {
  it('vibrates when the phase changes and asks for a screen wake lock', async () => {
    const vibrate = vi.fn();
    const release = vi.fn();
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const env = setup();
    await enterGame(env, gameView());
    expect(request).toHaveBeenCalledWith('screen');
    expect(vibrate).not.toHaveBeenCalled();
    act(() => env.fire('game:view', gameView({ phase: 'report', me: { ...gameView().me, awaitingAction: false } })));
    expect(vibrate).toHaveBeenCalledWith(80);
    act(() => env.fire('game:view', gameView({ phase: 'vote', day: 1 })));
    expect(vibrate).toHaveBeenLastCalledWith([120, 60, 120]);
    delete navigator.vibrate;
    delete navigator.wakeLock;
  });

  it('works on browsers without vibration or wake lock', async () => {
    const env = setup();
    await enterGame(env, gameView());
    act(() => env.fire('game:view', gameView({ phase: 'vote' })));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vote');
  });
});

describe('describeEvent', () => {
  const players = [person('a', 'Amir'), person('b', 'Dana')];
  const t = (key, params) => translate('en', key, params);

  it('describes each public event and ignores the rest', () => {
    expect(describeEvent({ key: 'vote.kicked', params: { playerId: 'a', role: 'mafia' } }, players, t)).toBe('Amir was voted out. Role: Mafia');
    expect(describeEvent({ key: 'vote.accused', params: { playerId: 'b' } }, players, t)).toBe('Dana received the most votes.');
    expect(describeEvent({ key: 'defense.spared', params: { playerId: 'b' } }, players, t)).toContain('stays in the game');
    expect(describeEvent({ key: 'vote.tied', params: {} }, players, t)).toContain('tied');
    expect(describeEvent({ key: 'night.died', params: { playerId: 'zzz' } }, players, t)).toBe('? was killed in the night.');
    expect(describeEvent({ key: 'game.over', params: {} }, players, t)).toBeNull();
  });
});

describe('skipping the discussion', () => {
  const discussing = (skip, me = {}) =>
    withMe({ awaitingAction: false, ...me }, { phase: 'discussion', skip });

  it('shows how many agreed and lets the player agree and take it back', async () => {
    const env = setup();
    await enterGame(env, discussing({ needed: 4, agreed: 1, mine: false }));
    expect(screen.getByText('1 of 4 agreed to skip')).toBeInTheDocument();
    env.replies['game:action'] = { ok: true };
    await userEvent.click(screen.getByRole('button', { name: 'Skip the discussion' }));
    expect(actions(env)).toEqual([{ type: 'skip', agree: true }]);

    act(() => env.fire('game:view', discussing({ needed: 4, agreed: 2, mine: true })));
    const button = screen.getByRole('button', { name: 'You agreed to skip. Tap to take it back.' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(actions(env).at(-1)).toEqual({ type: 'skip', agree: false });
  });

  it('hides the skip button from the dead and outside the discussion', async () => {
    const env = setup();
    await enterGame(env, discussing({ needed: 3, agreed: 0, mine: false }, { alive: false }));
    expect(screen.queryByRole('button', { name: 'Skip the discussion' })).toBeNull();
    act(() => env.fire('game:view', gameView({ phase: 'vote' })));
    expect(screen.queryByRole('button', { name: 'Skip the discussion' })).toBeNull();
  });

  it('announces a skipped discussion in the story', async () => {
    const env = setup();
    const events = [{ seq: 0, day: 1, key: 'discussion.skipped', params: {} }];
    await enterGame(env, discussing({ needed: 3, agreed: 3, mine: true }, {}));
    act(() => env.fire('game:view', withMe({ awaitingAction: false }, { phase: 'discussion', skip: { needed: 3, agreed: 3, mine: true }, events })));
    expect(screen.getByLabelText('What happened')).toHaveTextContent('Everyone agreed to skip the discussion.');
  });

  it('shows the skip controls in Arabic', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, discussing({ needed: 4, agreed: 1, mine: false }));
    expect(screen.getByRole('button', { name: 'تخطَّ النقاش' })).toBeInTheDocument();
    expect(screen.getByText('وافق 1 من 4 على التخطي')).toBeInTheDocument();
  });
});

describe('bot chat messages', () => {
  const botMessage = (id, key, variant, target) => ({
    id,
    playerId: 'bot-1',
    name: 'Bot 1',
    text: null,
    template: { key, variant, params: target ? { target } : {} },
    day: 1,
    phase: 'discussion',
    at: id,
  });

  it('shows the same bot line in the language of each reader, with names filled in', async () => {
    const env = setup();
    await enterGame(env, gameView({ phase: 'discussion' }));
    act(() => env.fire('room:state', lobbyState({ phase: 'playing', players: [
      { id: 'g_me', name: 'Hosny', isBot: false, connected: true, left: false },
      { id: 'g_b', name: 'Dana', isBot: false, connected: true, left: false },
      { id: 'bot-1', name: 'Bot 1', isBot: true, connected: false, left: false },
    ] })));
    act(() => env.fire('chat:message', botMessage(1, 'suspect', 0, 'g_b')));
    expect(screen.getByText('I suspect Dana. They have been acting strange.')).toBeInTheDocument();
    expect(screen.getByText('Bot 1')).toBeInTheDocument();
  });

  it('shows bot lines in Arabic and handles lines without a target', async () => {
    const env = setup({ lang: 'ar' });
    await enterGame(env, gameView({ phase: 'discussion' }));
    act(() => env.fire('chat:message', botMessage(1, 'filler', 1)));
    act(() => env.fire('chat:message', botMessage(2, 'suspect', 1, 'unknown-id')));
    expect(screen.getByText('لنقارن ما قاله كل واحد.')).toBeInTheDocument();
    expect(screen.getByText('هناك شيء في ? يزعجني.')).toBeInTheDocument();
  });
});
