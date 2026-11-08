import { notFound } from "next/navigation";
import Workspace from "./workspace";
import {
  parseWorkspacePath,
  workspacePath,
  type WorkspaceRoute,
} from "@/lib/workspace-routes";
export default function WorkspaceRoutePage({
  route,
}: {
  route: WorkspaceRoute;
}) {
  if (!parseWorkspacePath(workspacePath(route))) notFound();
  return <Workspace route={route} />;
}
