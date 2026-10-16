import { CommunityHeader } from "@/components/community/community-header";
import { StudentWorkspaceHeader } from "@/components/student/workspace-header";
import type { AccountContext } from "@/lib/auth";
import { communityNavigation } from "@/lib/community/navigation";

export function RoleAwareCommunityHeader({
  account,
  legacyWorkspaceHref,
}: {
  account: AccountContext;
  legacyWorkspaceHref?: string;
}) {
  if (account.role === "student") {
    return <StudentWorkspaceHeader firstName={account.firstName} lastName={account.lastName} mode="community" />;
  }

  const navigation = communityNavigation(account);
  const name = [account.firstName, account.lastName].filter(Boolean).join(" ") || "TXKPRO member";

  return <CommunityHeader name={name} {...navigation} workspaceHref={legacyWorkspaceHref ?? navigation.workspaceHref} />;
}
