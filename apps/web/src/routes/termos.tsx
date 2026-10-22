import { createFileRoute } from '@tanstack/react-router';
import { LegalPage } from '../features/legal/LegalPage';
import { terms } from '../features/legal/documents';

export const Route = createFileRoute('/termos')({
  head: () => ({ meta: [
    { title: 'Termos de Uso — Janjalive' },
    { name: 'description', content: terms.description },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: () => <LegalPage document={terms} kind="terms" />,
});
