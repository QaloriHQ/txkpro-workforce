import { redirect } from "next/navigation";
// Legacy multi-pipeline route retained for bookmarks. The directory is the
// only entrypoint for new pipelines; editing always requires a concrete ID.
export default function LegacyPipelineBuilderRedirect() {
  redirect("/employer/pipelines");
}
