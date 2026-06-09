import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, DirectionProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import './i18n'; // bootstrap i18next before App renders
import './index.css';
import App from './App.jsx';
import { RTL_LANGUAGES } from './i18n';
import MantineDirectionSync from './components/MantineDirectionSync.jsx';

const initialDir = RTL_LANGUAGES.has(document.documentElement.lang || 'en') ? 'rtl' : 'ltr';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DirectionProvider initialDirection={initialDir} detectDirection={false}>
      <MantineProvider defaultColorScheme="dark">
        <MantineDirectionSync />
        <Notifications position="top-right" zIndex={200} />
        <App />
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>
);
