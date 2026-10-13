import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  colors: {
    dark: [
      '#f0f3f6', // 0
      '#d0d7de', // 1
      '#afb8c1', // 2
      '#8c959f', // 3
      '#6e7781', // 4
      '#30363d', // 5 - borders
      '#21262d', // 6 - elevated surfaces
      '#161b22', // 7 - cards / sidebars
      '#0d1117', // 8 - deep panels
      '#080a0f', // 9 - page background
    ],
  },
});
