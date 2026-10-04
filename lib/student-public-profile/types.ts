export type StudentPublicSettings = {
  chosen: boolean;
  visibility: "public" | "private" | null;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  path: string | null;
};
export type PublicStudentPage = {
  found: boolean;
  redirect?: boolean;
  path?: string;
  displayName?: string;
  headline?: string | null;
  bio?: string | null;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
};
