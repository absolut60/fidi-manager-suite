import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PreventiviListView } from '@/components/preventivatore/PreventiviListView';
import { PreventiviSoggettoTab } from '@/components/preventivatore/PreventiviSoggettoTab';
import { BadgeLinea } from '@/components/preventivatore/BadgeLinea';

export const Route = createFileRoute('/fm72-linee-verifica')({
  head: () => ({ meta: [{ title: 'Verifica linee — MADE' }, { name: 'description', content: 'Verifica temporanea' }, { property: 'og:title', content: 'Verifica linee — MADE' }, { property: 'og:description', content: 'Verifica temporanea' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
  component: () => <ClientOnly><div className="flex flex-wrap items-center gap-2 p-3"><h1>PRV-200/26</h1><BadgeLinea linea={undefined}/></div><PreventiviListView tipo="preventivo"/><div className="p-3"><PreventiviSoggettoTab soggetto={{ tipo: 'lead', id: '11111111-1111-4111-8111-111111111111', etichetta: 'Lead prova' }}/></div></ClientOnly>,
});