import { Fragment, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import { useLooks } from '../net/useLooks.js';
import { QUICK_EMOJI } from '../quick.js';
import Avatar from './Avatar.jsx';
import ErrorText from './ErrorText.jsx';
import QuickBar from './QuickBar.jsx';

export default function Chat({
  canSend,
  closedKey,
  channel = 'main',
  titleKey = 'chat.title',
  emptyKey = 'chat.empty',
  hintKey = null,
  quick = true,
}) {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const look = useLooks();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const messages = state.chat.filter((message) => (message.channel ?? 'main') === channel);
  const nameOf = (id) => state.room?.players.find((p) => p.id === id)?.name ?? '?';
  const bodyOf = (message) => {
    if (message.template) {
      return t(`bot.say.${message.template.key}.${message.template.variant}`, { target: nameOf(message.template.params?.target) });
    }
    if (message.quick) return QUICK_EMOJI.includes(message.quick) ? message.quick : t(`quick.${message.quick}`);
    return message.text;
  };

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function send(event) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    const result = await request('chat:send', { text: clean });
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setText('');
  }

  let lastDay = null;
  return (
    <section className={channel === 'dead' ? 'chat dead-chat' : 'chat'} aria-label={t(titleKey)}>
      {hintKey && <p className="hint">{t(hintKey)}</p>}
      <ol ref={listRef} className="chat-list">
        {messages.length === 0 && <li className="chat-empty">{t(emptyKey)}</li>}
        {messages.map((message) => {
          const divider = message.day > 0 && message.day !== lastDay;
          lastDay = message.day;
          return (
            <Fragment key={message.id}>
              {divider && <li className="chat-day">{t('chat.day', { day: message.day })}</li>}
              <li className={message.playerId === state.playerId ? 'msg mine' : 'msg'}>
                <span className="msg-head">
                  <Avatar look={look(message.playerId)} />
                  <bdi className="msg-name" data-color={look(message.playerId)?.color}>
                    {message.name}
                  </bdi>
                </span>
                <span dir="auto" className={QUICK_EMOJI.includes(message.quick) ? 'big-emoji' : undefined}>
                  {bodyOf(message)}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      {canSend && quick && <QuickBar />}
      {canSend ? (
        <form className="chat-form" onSubmit={send}>
          <input
            aria-label={`${t(titleKey)}: ${t('chat.placeholder')}`}
            placeholder={t('chat.placeholder')}
            value={text}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="button primary">
            {t('chat.send')}
          </button>
        </form>
      ) : (
        <p className="hint">{t(closedKey)}</p>
      )}
      <ErrorText code={error} />
    </section>
  );
}
