import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useTutorial } from './TutorialContext.jsx';

const SLIDES = [
  { id: 1, lines: ['body'] },
  { id: 2, lines: ['mafia', 'doctor', 'police', 'citizen'] },
  { id: 3, lines: ['body'] },
  { id: 4, lines: ['body'] },
  { id: 5, lines: ['body'] },
  { id: 6, lines: ['body'] },
  { id: 7, lines: ['body'] },
];

export default function Tutorial() {
  const { t } = useI18n();
  const { isOpen, close } = useTutorial();
  const [step, setStep] = useState(0);
  const panel = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setStep(0);
    panel.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;

  return (
    <div className="tutorial-backdrop">
      <div className="tutorial" role="dialog" aria-modal="true" aria-label={t('tutorial.title')} tabIndex={-1} ref={panel}>
        <p className="hint">{t('tutorial.progress', { step: step + 1, total: SLIDES.length })}</p>
        <h2>{t(`tutorial.${slide.id}.title`)}</h2>
        <div className="tutorial-body">
          {slide.lines.map((line) => (
            <p key={line}>{t(`tutorial.${slide.id}.${line}`)}</p>
          ))}
        </div>
        <div className="tutorial-actions">
          <button type="button" className="button secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
            {t('common.back')}
          </button>
          {last ? (
            <button type="button" className="button primary" onClick={close}>
              {t('tutorial.start')}
            </button>
          ) : (
            <button type="button" className="button primary" onClick={() => setStep(step + 1)}>
              {t('common.next')}
            </button>
          )}
        </div>
        {!last && (
          <button type="button" className="button quiet" onClick={close}>
            {t('common.close')}
          </button>
        )}
      </div>
    </div>
  );
}
