import { getEmployeeCredentials } from "./employee-auth";

export const ROLE_SOURCE_MAP: Record<string, string> = {
  frontend: "document/company/frontend-developer.txt",
  backend: "document/company/backend-developer.txt",
  fullstack: "document/company/fullstack-developer.txt",
  mobile: "document/company/mobile-developer.txt",
  "ui ux": "document/company/ui-ux.txt",
  "ui/ux": "document/company/ui-ux.txt",
  "testing qa": "document/company/testing-QA.txt",
  "qa tester": "document/company/testing-QA.txt",
  devops: "document/company/devops.txt",
  "digital marketing": "document/company/digital.txt",
  hr: "document/company/hr.txt",
  "sales development": "document/company/sales-development.txt",
};

export const PRIVILEGED_PROFILE_SOURCES: Record<string, string> = {
  admin: "document/company/admin.txt",
  administrator: "document/company/admin.txt",
  owner: "document/company/owner.txt",
  owners: "document/company/owner.txt",
};

export function normaliseQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/full[\s-]*stack/g, "fullstack")
    .replace(/devel+opers?/g, "developer")
    .replace(/develpers?/g, "developer")
    .replace(/\s+/g, " ")
    .trim();
}

export function getTeamSource(question: string) {
  const normalised = normaliseQuestion(question);

  for (const [team, source] of Object.entries(ROLE_SOURCE_MAP)) {
    const escapedTeam = team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\W)${escapedTeam}(?=\\W|$)`, "i").test(normalised)) {
      return source;
    }
  }

  return null;
}

export function getPrivilegedProfileSource(question: string) {
  const normalised = normaliseQuestion(question);

  for (const [profile, source] of Object.entries(PRIVILEGED_PROFILE_SOURCES)) {
    if (new RegExp(`(^|\\W)${profile}(?=\\W|$)`, "i").test(normalised)) {
      return source;
    }
  }

  return null;
}
