import type { Skill, StudentSummary } from "@/lib/types";

export const demoSkills: Skill[] = [
  {
    id: "SKL-HVAC-001",
    trade: "HVAC",
    category: "Refrigeration",
    name: "R-410A Refrigerant Recovery",
    description: "Safely recover R-410A using approved equipment and procedures.",
    status: "verified",
    verifiedBy: "Megan Webb",
    verifiedAt: "Sep 12, 2026",
  },
  {
    id: "SKL-HVAC-002",
    trade: "HVAC",
    category: "Diagnostics",
    name: "Electrical Diagnostics",
    description: "Use a multimeter and sequence-of-operation checks to diagnose common faults.",
    status: "verified",
    verifiedBy: "Megan Webb",
    verifiedAt: "Sep 9, 2026",
  },
  {
    id: "SKL-HVAC-003",
    trade: "HVAC",
    category: "Installation",
    name: "Residential Split-System Install",
    description: "Assist with equipment placement, line-set preparation, drain routing, and startup.",
    status: "self_attested",
  },
  {
    id: "SKL-HVAC-004",
    trade: "HVAC",
    category: "Airflow",
    name: "Static Pressure Measurement",
    description: "Measure total external static pressure and interpret basic airflow constraints.",
    status: "learning",
  },
  {
    id: "SKL-HVAC-005",
    trade: "HVAC",
    category: "Safety",
    name: "Electrical Lockout / Tagout",
    description: "Demonstrate safe de-energization and verification procedures before service work.",
    status: "verified",
    verifiedBy: "David Turner",
    verifiedAt: "Sep 5, 2026",
  },
];

export const demoStudents: StudentSummary[] = [
  {
    id: "STU-1001",
    name: "Brandon Carter",
    program: "HVAC Technology",
    school: "Texarkana College",
    city: "Texarkana, TX",
    verifiedSkills: 18,
    totalSkills: 24,
    readiness: {
      validDriversLicense: true,
      cleanDrivingRecord: true,
      willingBackgroundCheck: true,
      willingDrugScreen: true,
      shiftPreferences: ["Day shift", "On-call rotation"],
      workPreferences: ["Residential service", "Light commercial"],
      discoverable: true,
    },
    status: "available",
  },
  {
    id: "STU-1002",
    name: "Alyssa Moore",
    program: "Electrical Technology",
    school: "Texarkana College",
    city: "Wake Village, TX",
    verifiedSkills: 21,
    totalSkills: 26,
    readiness: {
      validDriversLicense: true,
      cleanDrivingRecord: true,
      willingBackgroundCheck: true,
      willingDrugScreen: true,
      shiftPreferences: ["Day shift"],
      workPreferences: ["Commercial construction", "Residential rough-in"],
      discoverable: true,
    },
    status: "referred",
  },
  {
    id: "STU-1003",
    name: "Marcus Reed",
    program: "Plumbing Technology",
    school: "UA Local Training Program",
    city: "Texarkana, AR",
    verifiedSkills: 14,
    totalSkills: 22,
    readiness: {
      validDriversLicense: true,
      cleanDrivingRecord: null,
      willingBackgroundCheck: true,
      willingDrugScreen: true,
      shiftPreferences: ["Day shift", "Evening shift"],
      workPreferences: ["New construction", "Service calls"],
      discoverable: true,
    },
    status: "available",
  },
];

export const demoReferrals = [
  { id: "REF-2407", student: "Alyssa Moore", employer: "LiveWire Electric", educator: "David Turner", date: "Sep 14", status: "Viewed" },
  { id: "REF-2406", student: "Brandon Carter", employer: "AirPro Texarkana", educator: "Megan Webb", date: "Sep 13", status: "Contacted" },
  { id: "REF-2405", student: "Marcus Reed", employer: "Red River Plumbing", educator: "Michael Lee", date: "Sep 11", status: "Referred" },
];

export const demoPulses = [
  { id: "PLS-301", employee: "Jordan Mills", employer: "LiveWire Electric", day: 30, studentScore: 3, employerScore: 2, flag: true, note: "Student reports unclear schedule expectations." },
  { id: "PLS-302", employee: "Tasha Green", employer: "AirPro Texarkana", day: 60, studentScore: 1, employerScore: 1, flag: false, note: "Both sides report onboarding is going well." },
  { id: "PLS-303", employee: "Eli Brooks", employer: "Red River Plumbing", day: 90, studentScore: 2, employerScore: 1, flag: false, note: "Student requested additional field coaching." },
];
