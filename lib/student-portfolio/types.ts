export type FileAccess = "private" | "public" | "employer";
export type PortfolioFile = {
  id: string;
  title: string;
  kind: "photo" | "cover" | "project" | "resume" | "certificate" | "document";
  access: FileAccess;
  mime: string;
  size: number;
};
export type PortfolioProject = {
  id: string;
  title: string;
  description: string;
  skills: string;
  visibility: "private" | "public";
  imageId: string | null;
};
export type PortfolioPreferences = {
  panelOrder?: ("credentials" | "projects" | "files")[];
  layout?: "comfortable" | "compact";
  showSkills: boolean;
  showTraining: boolean;
  showBadges: boolean;
  showCertifications: boolean;
  showProgress: boolean;
  rankingScope: "cohort" | "institution" | "txkpro";
  photoId: string | null;
  coverId: string | null;
};
export type PortfolioEvidence = {
  id: string;
  title: string;
  category:
    | "instructor_verified"
    | "employer_training"
    | "company_badge"
    | "employer_certification";
  issuer: string;
  status: string;
  date: string | null;
  expiresAt: string | null;
  version: number | null;
};
export type StudentPortfolio = {
  studentId?: string;
  preferences: PortfolioPreferences;
  projects: PortfolioProject[];
  files: PortfolioFile[];
  evidence?: PortfolioEvidence[];
  progression: null;
};
