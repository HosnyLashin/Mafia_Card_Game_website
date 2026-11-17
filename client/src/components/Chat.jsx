import { Fragment, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useConnection } from '../net/ConnectionProvider.jsx';
import ErrorText from './ErrorText.jsx';

export default function Chat({ canSend, closedKey }) {
  const { t } = useI18n();
  const { state, request } = useConnection();
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const messages = state.chat;

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
    <section className="chat" aria-label={t('chat.title')}>
      <ol ref={listRef} className="chat-list">
        {messages.length === 0 && <li className="chat-empty">{t('chat.empty')}</li>}
        {messages.map((message) => {
          const divider = message.day > 0 && message.day !== lastDay;
          lastDay = message.day;
          return (
            <Fragment key={message.id}>
              {divider && <li className="chat-day">{t('chat.day', { day: message.day })}</li>}
              <li className={message.playerId === state.playerId ? 'msg mine' : 'msg'}>
                <bdi className="msg-name">{message.name}</bdi>
                <span dir="auto">{message.text}</span>
              </li>
            </Fragment>
          );
        })}
      </ol>
      {canSend ? (
        <form className="chat-form" onSubmit={send}>
          <input
            aria-label={t('chat.placeholder')}
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
