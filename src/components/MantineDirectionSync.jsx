import { useEffect } from 'react';
import { useDirection } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { RTL_LANGUAGES } from '../i18n';

/**
 * Bridges react-i18next → Mantine's DirectionProvider so any Mantine
 * component (Modal, NumberInput, Notifications) flips to RTL whenever the
 * user switches to a right-to-left language (Hebrew).
 *
 * Renders nothing. Mount once, inside <MantineProvider>.
 */
export default function MantineDirectionSync() {
  const { i18n } = useTranslation();
  const { setDirection } = useDirection();

  useEffect(() => {
    const dir = RTL_LANGUAGES.has(i18n.resolvedLanguage || i18n.language) ? 'rtl' : 'ltr';
    setDirection(dir);
  }, [i18n.language, i18n.resolvedLanguage, setDirection]);

  return null;
}
