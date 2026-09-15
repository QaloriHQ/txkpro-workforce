export type Role = "student" | "educator" | "employer" | "admin";

export type SkillStatus = "not_started" | "learning" | "self_attested" | "verified";

export type Skill = {
  id: string;
  trade: string;
  category: string;
  name: string;
  description: string;
  status: SkillStatus;
  verifiedBy?: string;
  verifiedAt?: string;
};

export type JobReadiness = {
  validDriversLicense: boolean | null;
  cleanDrivingRecord: boolean | null;
  willingBackgroundCheck: boolean | null;
  willingDrugScreen: boolean | null;
  shiftPreferences: string[];
  workPreferences: string[];
  discoverable: boolean;
};

export type StudentSummary = {
  id: string;
  name: string;
  program: string;
  school: string;
  city: string;
  verifiedSkills: number;
  totalSkills: number;
  readiness: JobReadiness;
  status: "available" | "referred" | "hired";
};
