export function safeStorage() {
  try {
    const probe = window.localStorage;
    probe.getItem('mafia.probe');
    return {
      getItem: (key) => {
        try {
          return probe.getItem(key);
        } catch {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          probe.setItem(key, value);
        } catch {
          return;
        }
      },
    };
  } catch {
    const memory = new Map();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
  }
}
