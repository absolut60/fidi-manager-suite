import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/verifica-testata')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/verifica-testata"!</div>
}
