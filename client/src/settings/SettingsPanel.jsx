import { useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useSettings } from './SettingsContext.jsx';

const SIZES = ['normal', 'large', 'xlarge'];

export default function SettingsButton() {
  const { t } = useI18n();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const panel = useRef(null);
  useFocusTrap(panel, open);

  return (
    <>
      <button type="button" className="icon-button" aria-label={t('settings.open')} onClick={() => setOpen(true)}>
        ⚙
      </button>
      {open && (
        <div
          className="tutorial-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          <div className="tutorial settings" role="dialog" aria-modal="true" aria-label={t('settings.title')} tabIndex={-1} ref={panel}>
            <h2>{t('settings.title')}</h2>
            <label className="switch">
              <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
              <span>{t('settings.sound')}</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={settings.vibration} onChange={(e) => update({ vibration: e.target.checked })} />
              <span>{t('settings.vibration')}</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => update({ reduceMotion: e.target.checked })} />
              <span>{t('settings.reduceMotion')}</span>
            </label>
            <fieldset className="sizes">
              <legend>{t('settings.textSize')}</legend>
              {SIZES.map((size) => (
                <label key={size} className="size">
                  <input
                    type="radio"
                    name="text-size"
                    value={size}
                    checked={settings.textSize === size}
                    onChange={() => update({ textSize: size })}
                  />
                  <span>{t(`settings.size.${size}`)}</span>
                </label>
              ))}
            </fieldset>
            <button type="button" className="button primary" onClick={() => setOpen(false)}>
              {t('settings.done')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
