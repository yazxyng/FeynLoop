import WorkspaceRoutePage from "@/components/workspace-route-page";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <WorkspaceRoutePage route={{ view: "concepts", projectId }} />;
}
