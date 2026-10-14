import React from 'react';
import { Box, Button, Container, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { IconScreen } from '../features/room/components/Icons';

export function NotFound() {
  return (
    <Container
      size="sm"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        minHeight: '60vh',
      }}
    >
      <Stack align="center" gap="md" style={{ textAlign: 'center', maxWidth: 460 }}>
        <Box
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6',
          }}
        >
          <IconScreen size={32} />
        </Box>
        <Title order={1} style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f0f3f6' }}>
          404
        </Title>
        <Title order={2} style={{ fontSize: '1.25rem', fontWeight: 600, color: '#d0d7de' }}>
          Página não encontrada
        </Title>
        <Text size="sm" style={{ color: '#8c959f', lineHeight: 1.6 }}>
          A sala ou página que você está procurando não existe, expirou ou o link informado está incorreto.
        </Text>
        <Button
          component={Link}
          to="/"
          variant="filled"
          color="blue"
          size="md"
          mt="sm"
          style={{
            backgroundColor: '#2563eb',
          }}
        >
          Voltar para o início
        </Button>
      </Stack>
    </Container>
  );
}
