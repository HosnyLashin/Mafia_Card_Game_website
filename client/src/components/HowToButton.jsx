import { useI18n } from '../i18n/index.jsx';
import { useTutorial } from '../tutorial/TutorialContext.jsx';

export default function HowToButton() {
  const { t } = useI18n();
  const { open } = useTutorial();
  return (
    <button type="button" className="button quiet" onClick={open}>
      {t('home.howto')}
    </button>
  );
}
