import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '../features/legal/LegalPage';
import { privacy } from '../features/legal/documents';

export const Route = createFileRoute('/privacidade')({
  head: () => ({ meta: [
    { title: 'Política de Privacidade — Janjalive' },
    { name: 'description', content: privacy.description },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: () => <LegalPage document={privacy} kind="privacy" />,
});
