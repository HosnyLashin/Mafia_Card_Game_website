import { useEffect, useState } from 'react';
import { useConnection } from '../net/ConnectionProvider.jsx';

function remainingSeconds(deadline, offset) {
  return Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000));
}

export default function Countdown({ deadline }) {
  const { state } = useConnection();
  const offset = state.clockOffset;
  const [seconds, setSeconds] = useState(() => remainingSeconds(deadline, offset));

  useEffect(() => {
    setSeconds(remainingSeconds(deadline, offset));
    const timer = setInterval(() => setSeconds(remainingSeconds(deadline, offset)), 250);
    return () => clearInterval(timer);
  }, [deadline, offset]);

  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return (
    <span className="countdown" dir="ltr" role="timer" aria-live="off">
      {minutes}:{rest}
    </span>
  );
}
