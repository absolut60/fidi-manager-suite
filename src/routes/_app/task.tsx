import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/task")({
  component: TaskLayout,
});

function TaskLayout() {
  return <Outlet />;
}