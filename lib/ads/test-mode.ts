export function stagingStudentAdTesting(
  env: Record<string, string | undefined>,
  role?: string | null,
  status?: string | null,
): boolean {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "staging" &&
    role === "student" && status?.toLowerCase() === "active";
}
