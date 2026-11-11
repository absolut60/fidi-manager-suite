import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/prova-lettore-listini-temp')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/prova-lettore-listini-temp"!</div>
}
