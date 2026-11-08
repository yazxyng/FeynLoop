import WorkspaceRoutePage from "@/components/workspace-route-page";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; conceptId: string }>;
}) {
  const { projectId, conceptId } = await params;
  return (
    <WorkspaceRoutePage route={{ view: "result", projectId, conceptId }} />
  );
}
