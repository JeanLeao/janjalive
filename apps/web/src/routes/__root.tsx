import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router';
import {
  MantineProvider,
  ColorSchemeScript,
  mantineHtmlProps,
  Box,
} from '@mantine/core';
import '@mantine/core/styles.css';
import { theme } from '../theme';
import { NotFound } from '../components/NotFound';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#080a0f' },
      { title: 'Janjalive — compartilhamento em tempo real' },
    ],
    links: [
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'alternate icon', href: '/favicon.ico' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <html lang="pt-BR" {...mantineHtmlProps}>
      <head>
        <HeadContent />
        <ColorSchemeScript defaultColorScheme="dark" />
        <style>{`
          :focus-visible {
            outline: 2px solid #3b82f6 !important;
            outline-offset: 2px !important;
          }
          button:focus-visible,
          [role="button"]:focus-visible,
          a:focus-visible,
          input:focus-visible {
            outline: 2px solid #3b82f6 !important;
            outline-offset: 2px !important;
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: '#080a0f',
          color: '#e6edf3',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          overflowX: 'hidden',
          minHeight: '100vh',
        }}
      >
        <MantineProvider theme={theme} defaultColorScheme="dark">
          <Box
            style={{
              minHeight: '100vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#080a0f',
            }}
          >
            <Outlet />
          </Box>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
