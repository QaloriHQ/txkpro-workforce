import type { AccountContext } from "@/lib/auth";
import { hasEmployeeMembership, hasStaffProfileMembership } from "@/lib/auth";

export type CommunityNavigation = {
  communityHref: string;
  workspaceHref: string;
  profileHref: string | null;
  roleLabel: string;
};

export function communityNavigation(account: AccountContext): CommunityNavigation {
  if (account.role === "student") return { communityHref: "/student/community", workspaceHref: "/student", profileHref: "/student/profile", roleLabel: "Student" };
  if (account.role === "educator") return { communityHref: "/institution/community", workspaceHref: "/institution", profileHref: "/professional/profile", roleLabel: "Institution faculty" };
  if (account.role === "employer") return { communityHref: "/employer/community", workspaceHref: "/employer", profileHref: null, roleLabel: "Employer" };
  if (account.role === "admin") return { communityHref: "/community", workspaceHref: "/admin", profileHref: null, roleLabel: "Administrator" };
  if (hasEmployeeMembership(account)) return { communityHref: "/community", workspaceHref: "/employee", profileHref: "/professional/profile", roleLabel: "Employee" };
  if (hasStaffProfileMembership(account)) return { communityHref: "/community", workspaceHref: "/professional/profile", profileHref: "/professional/profile", roleLabel: "Professional" };
  return { communityHref: "/community", workspaceHref: "/student", profileHref: "/student/profile", roleLabel: "Member" };
}
