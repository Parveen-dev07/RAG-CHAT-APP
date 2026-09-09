import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCollection } from "@/lib/chroma";
import {
  employeeSessionCookie,
  getAllEmployeeProfiles,
  getEmployeeDirectory,
  getEmployeeProfile,
  getEmployeeProfilesByRole,
  getEmployeeProfilesFromSource,
  getEmployeeSession,
  redactPassword,
} from "@/lib/employee-auth";
import { getChatModel, getEmbeddings } from "@/lib/ollama";

const ROLE_SOURCE_MAP: Record<string, string> = {
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

const PRIVILEGED_PROFILE_SOURCES: Record<string, string> = {
  admin: "document/company/admin.txt",
  administrator: "document/company/admin.txt",
  owner: "document/company/owner.txt",
  owners: "document/company/owner.txt",
};

const PRIVILEGED_ROLES = new Set(["HR", "Admin", "Owner"]);

function normaliseQuestion(question: string) {
  return question
    .toLowerCase()
    .replace(/full[\s-]*stack/g, "fullstack")
    .replace(/devel+opers?/g, "developer")
    .replace(/develpers?/g, "developer")
    .replace(/\s+/g, " ")
    .trim();
}

function getTeamSource(question: string) {
  const normalised = normaliseQuestion(question);

  for (const [team, source] of Object.entries(ROLE_SOURCE_MAP)) {
    const escapedTeam = team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\W)${escapedTeam}(?=\\W|$)`, "i").test(normalised)) {
      return source;
    }
  }

  return null;
}

function getPrivilegedProfileSource(question: string) {
  const normalised = normaliseQuestion(question);

  for (const [profile, source] of Object.entries(PRIVILEGED_PROFILE_SOURCES)) {
    if (new RegExp(`(^|\\W)${profile}(?=\\W|$)`, "i").test(normalised)) {
      return source;
    }
  }

  return null;
}

function getDirectoryRequestType(question: string) {
  const normalised = normaliseQuestion(question);
  const mentionsEmployees = /\bemploye{1,2}s?\b/i.test(normalised);
  const asksForMany = /\b(all|list|show|give|every)\b/i.test(normalised);

  if (!mentionsEmployees || !asksForMany) return null;

  const asksForDetails = /\b(details?|profiles?|information)\b/i.test(normalised);
  const asksForSummary = /\b(ids?|names?)\b/i.test(normalised);

  if (asksForSummary && !asksForDetails) return "summary";
  return "details";
}

function isLeadershipDirectoryRequest(question: string) {
  return /all (managers|manager|team leads|team lead)|every department|all department.*(manager|team lead)|(manager|team lead).*every department/i.test(
    question
  );
}

function requestsLeadershipRoles(question: string) {
  return /team\s*lead|teamlead|manager|manger/i.test(question);
}

function response(answer: string, sources: Record<string, unknown>[] = []) {
  return NextResponse.json({ answer, sources });
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Missing 'question' in request body" }, { status: 400 });
    }

    const session = getEmployeeSession(
      req.cookies.get(employeeSessionCookie.name)?.value
    );
    const canViewAllEmployees = PRIVILEGED_ROLES.has(session?.role || "");
    const employeeIdMatch = question.match(/GEEK[-_\s]*EMP[-_\s]*(\d+)/i);
    const requestsOwnProfile = /\b(my|own)\s+(employee\s+)?(details|profile|information)\b/i.test(question);
    const requestedEmployeeId = employeeIdMatch
      ? `GEEK-EMP-${employeeIdMatch[1].padStart(3, "0")}`
      : requestsOwnProfile
        ? session?.employeeId
        : null;

    // Profile requests are always authorization checked first.
    if (requestedEmployeeId) {
      if (!session) {
        return response("Sign in with your employee ID or name and password before viewing employee details.");
      }
      if (session.employeeId !== requestedEmployeeId && !canViewAllEmployees) {
        return response("You can only view your own employee details.");
      }

      // Source files are the reliable fallback while Chroma is being updated.
      const sourceProfile = getEmployeeProfile(requestedEmployeeId);
      if (sourceProfile) return response(sourceProfile);
      return response("I don't have this employee in the company knowledge base.");
    }

    const teamSource = getTeamSource(question);
    if (teamSource) {
      if (!canViewAllEmployees) {
        return response("Employee profiles are private. Sign in and ask for your own details using your employee ID.");
      }
      const profiles = getEmployeeProfilesFromSource(
        teamSource,
        requestsLeadershipRoles(question) ? ["Manager", "Team Lead"] : undefined
      );
      return response(
        profiles.length
          ? profiles.join("\n\n---\n\n")
          : "I don't have employee details for that team in the company knowledge base."
      );
    }

    const directoryRequestType = getDirectoryRequestType(question);
    if (directoryRequestType) {
      if (!canViewAllEmployees) {
        return response("Employee directories are private. Sign in to view your own employee details.");
      }

      if (directoryRequestType === "summary") {
        const employees = getEmployeeDirectory();
        const directory = employees
          .map(
            (employee, index) =>
              `${index + 1}. ${employee.employeeId} — ${employee.employeeName}`
          )
          .join("\n");
        return response(
          directory
            ? `Employee IDs and names:\n\n${directory}`
            : "I don't have employee IDs and names in the company knowledge base."
        );
      }

      const profiles = getAllEmployeeProfiles();
      return response(
        profiles.length
          ? profiles.join("\n\n---\n\n")
          : "I don't have any employee details available. The company knowledge base is currently empty."
      );
    }

    if (isLeadershipDirectoryRequest(question)) {
      if (!canViewAllEmployees) {
        return response("Leadership profiles are private. Sign in with an authorized account to view them.");
      }
      const profiles = getEmployeeProfilesByRole(["Manager", "Team Lead"]);
      return response(
        profiles.length
          ? profiles.join("\n\n---\n\n")
          : "I don't have leadership details in the company knowledge base."
      );
    }

    const privilegedProfileSource = getPrivilegedProfileSource(question);
    if (privilegedProfileSource) {
      if (!canViewAllEmployees) {
        return response("Owner and administrator profiles are private. Sign in with an authorized account to view them.");
      }
      const profiles = getEmployeeProfilesFromSource(privilegedProfileSource);
      return response(
        profiles.length
          ? profiles.join("\n\n---\n\n")
          : "I don't have this profile in the company knowledge base."
      );
    }

    // General company knowledge remains RAG-based. Employee records are
    // intentionally excluded from this path to prevent profile data leaks.
    const collection = await getOrCreateCollection();
    const embeddings = getEmbeddings();
    const questionVector = await embeddings.embedQuery(question);
    const results = await collection.query({ queryEmbeddings: [questionVector], nResults: 4 });

    const documents = results.documents?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];
    const publicDocuments: string[] = [];
    const publicMetadatas: Record<string, unknown>[] = [];

    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index];
      const metadata = metadatas[index];

      if (
        typeof document === "string" &&
        document.trim().length > 0 &&
        metadata !== null &&
        metadata?.documentType !== "employee"
      ) {
        publicDocuments.push(document);
        publicMetadatas.push(metadata as Record<string, unknown>);
      }
    }

    const context = publicDocuments
      .map((document, index) => `[Chunk ${index + 1}]\n${redactPassword(document)}`)
      .join("\n\n");

    if (!context) {
      return response(
        "I couldn't find that in the company knowledge base. Try asking about company policies, services, technologies, or sign in with an authorized role to request employee information."
      );
    }

    const prompt = `You are a company knowledge assistant.

Answer the question using only the provided context. Do not guess or invent
information. If the answer is not in the context, say: "I don't have this
information in the company knowledge base."

Context:
${context}

Question:
${question}

Answer:`;

    const model = getChatModel();
    const result = await model.invoke(prompt);
    return response(String(result.content), publicMetadatas);
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
