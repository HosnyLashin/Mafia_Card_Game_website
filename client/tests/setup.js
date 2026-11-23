import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  window.localStorage.setItem('mafia.tutorialSeen', '1');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  window.history.replaceState({}, '', '/');
});
