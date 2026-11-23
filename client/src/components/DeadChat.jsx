import Chat from './Chat.jsx';

export default function DeadChat() {
  return <Chat channel="dead" canSend titleKey="chat.deadTitle" emptyKey="chat.deadEmpty" hintKey="chat.deadHint" />;
}
