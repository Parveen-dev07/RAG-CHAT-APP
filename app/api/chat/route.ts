import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCollection } from "@/lib/chroma";
import {
  employeeSessionCookie,
  getAllEmployeeProfiles,
  getEmployeeById,
  getEmployeeCredentials,
  getEmployeeDirectory,
  getEmployeeProfile,
  getEmployeeProfileByName,
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

/**
 * Extracts a specific employee name from a question.
 * Handles patterns like:
 *  - "give me details of this employee name is Anwar khan"
 *  - "tell me about employee Anwar khan"
 *  - "show details for Anwar khan"
 *  - "who is Anwar khan"
 *  - "Anwar khan details"
 *  - "what is Anwar khan's role"
 *  - "give me Anwar khan's details"
 *  - "can you tell me about Anwar khan"
 *
 * The extracted name is verified against the actual employee directory so
 * phrases like "about company policies" are never mistaken for a person.
 */
function extractEmployeeName(question: string): string | null {
  const normalized = question.replace(/\s+/g, " ").trim();
  const knownNames = new Set(
    getEmployeeCredentials().map((employee) => employee.employeeName.toLowerCase())
  );

  const candidates: string[] = [];

  // Pattern 1: "employee name is X" / "employee named X" / "name is X"
  const nameIsMatch = normalized.match(
    /(?:employee\s+)?name\s+(?:is|of|as)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/i
  );
  if (nameIsMatch) candidates.push(nameIsMatch[1].trim());

  // Pattern 2: "employee X" / "employee called X" / "employee named X"
  const employeeMatch = normalized.match(
    /employee\s+(?:called|named|by\s+the\s+name|with\s+the\s+name)?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/i
  );
  if (employeeMatch) candidates.push(employeeMatch[1].trim());

  // Pattern 3: "about X" / "for X" / "of X" where X looks like a person name
  const aboutMatch = normalized.match(
    /\b(?:about|for|of|regarding|concerning)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/i
  );
  if (aboutMatch) candidates.push(aboutMatch[1].trim());

  // Pattern 4: "who is X" / "tell me about X" / "what is X" / "what about X"
  const whoIsMatch = normalized.match(
    /\b(?:who\s+is|tell\s+me\s+about|what\s+is|what\s+about|can\s+you\s+tell\s+me\s+about)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/i
  );
  if (whoIsMatch) candidates.push(whoIsMatch[1].trim());

  // Pattern 5: Question starts with a name, e.g. "Anwar khan details"
  const startsWithName = normalized.match(
    /^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:details|profile|information|info|record|data)\b/i
  );
  if (startsWithName) candidates.push(startsWithName[1].trim());

  // Pattern 6: Possessive form, e.g. "Anwar khan's details" / "Anwar khan's profile"
  const possessiveMatch = normalized.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})'s\s+(?:details|profile|information|info|record|data|role|position|department|experience|technology|responsibilities)\b/i
  );
  if (possessiveMatch) candidates.push(possessiveMatch[1].trim());

  // Pattern 7: "give me X's details" / "show me X's profile"
  const giveMeMatch = normalized.match(
    /\b(?:give|show|get|fetch|find)\s+me\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})'s\s+(?:details|profile|information|info|record|data)\b/i
  );
  if (giveMeMatch) candidates.push(giveMeMatch[1].trim());

  // Verify candidates against the actual employee directory.
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase();
    if (knownNames.has(normalizedCandidate)) {
      return candidate;
    }

    // Also try partial match: e.g. "Anwar" should match "Anwar khan"
    for (const knownName of knownNames) {
      if (knownName.startsWith(normalizedCandidate) || normalizedCandidate.startsWith(knownName)) {
        return candidate;
      }
    }
  }

  return null;
}

function getDirectoryRequestType(question: string) {
  const normalised = normaliseQuestion(question);
  const mentionsEmployees = /\bemploye{1,2}s?\b/i.test(normalised);
  // Only clear "all/many" indicators trigger a directory request.
  // Words like "give" or "show" alone do NOT mean "all employees".
  const asksForMany = /\b(all|list|every|each)\b/i.test(normalised);

  if (!mentionsEmployees || !asksForMany) return null;

  // If a specific employee name is mentioned, this is NOT a directory request.
  if (extractEmployeeName(question)) return null;

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

function extractRequestedLeadershipRoles(question: string): string[] {
  const normalised = normaliseQuestion(question);
  const requestedRoles = new Set<string>();

  if (/\b(team\s*lead|teamlead)\b/.test(normalised)) {
    requestedRoles.add("Team Lead");
  }

  if (/\b(manager|department\s+manager|manger)\b/.test(normalised)) {
    requestedRoles.add("Manager");
  }

  return Array.from(requestedRoles);
}

function isGreetingQuestion(question: string) {
  const normalised = normaliseQuestion(question);
  const greetingWord = /\b(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|namaste|how\s+are\s+you|how\s+you\s+doing|what's\s+up|what\s+are\s+you\s+doing)\b/.test(normalised);
  const mentionsRag = /\brag\b/.test(normalised);

  return greetingWord || mentionsRag;
}

function greetingResponse(question: string) {
  if (!isGreetingQuestion(question)) return null;

  return "Hi! I’m Rag, the Geek Tech company knowledge assistant. I’m here to help with company policies, services, technologies, and employee information when you sign in with an authorized role.";
}

function smallTalkResponse(question: string): string | null {
  const normalised = normaliseQuestion(question);

  if (/\b(?:who\s+are\s+you|what\s+are\s+you|tell\s+me\s+about\s+yourself|what\s+is\s+your\s+name)\b/.test(normalised)) {
    return "I’m Rag, the Geek Tech company assistant. I can help you ask about company policies, services, technologies, and employee profiles when you sign in with an authorized role.";
  }

  if (/\b(?:what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+can\s+you\s+help|can\s+you\s+help)\b/.test(normalised)) {
    return "I can answer company knowledge questions, explain services and technologies, and help employees request employee profiles after sign-in with an authorized role.";
  }

  if (/\b(?:thanks|thank\s+you|thankyou)\b/.test(normalised)) {
    return "You’re welcome! I’m here to help with Geek Tech company details, services, technologies, and employee information after sign-in.";
  }

  if (/\b(?:bye|goodbye|see\s+you|talk\s+later)\b/.test(normalised)) {
    return "Goodbye! I’m here whenever you want to ask about Geek Tech company policies, services, technologies, or employee details with sign-in.";
  }

  if (/\b(?:how\s+are\s+you|how\s+you\s+doing|what's\s+up)\b/.test(normalised)) {
    return "I’m doing well and ready to help with Geek Tech company information, services, technologies, and employee profiles after sign-in.";
  }

  return null;
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

    // NEW: Detect a specific employee name in the question (e.g. "Anwar khan")
    const employeeName = extractEmployeeName(question);
    if (employeeName) {
      if (!session) {
        return response("Sign in with your employee ID or name and password before viewing employee details.");
      }

      // Allow employees to view their own profile by name.
      const sessionEmployee = getEmployeeById(session.employeeId);
      const sessionName = sessionEmployee?.employeeName?.toLowerCase();
      const isOwnProfile = sessionName && employeeName.toLowerCase() === sessionName;

      if (!canViewAllEmployees && !isOwnProfile) {
        return response("You can only view your own employee details. Sign in with an authorized HR, Admin, or Owner account to view other employees.");
      }

      const sourceProfile = getEmployeeProfileByName(employeeName);
      if (sourceProfile) return response(sourceProfile);
      return response(`I don't have an employee named "${employeeName}" in the company knowledge base.`);
    }

    const teamSource = getTeamSource(question);
    if (teamSource) {
      if (!canViewAllEmployees) {
        return response("Employee profiles are private. Sign in and ask for your own details using your employee ID.");
      }

      const requestedRoles = extractRequestedLeadershipRoles(question);
      const profiles = getEmployeeProfilesFromSource(
        teamSource,
        requestedRoles.length ? requestedRoles : undefined
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

    const greeting = greetingResponse(question);
    if (greeting) {
      return response(greeting);
    }

    const casual = smallTalkResponse(question);
    if (casual) {
      return response(casual);
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
    const results = await collection.query({ queryEmbeddings: [questionVector], nResults: 6 });

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




    const prompt = `You are a company knowledge assistant for Geek Tech.

Answer the question using ONLY the provided context below. Follow these rules strictly:

1. If the question asks about a specific employee by name or ID, provide ONLY that employee's details from the context.
2. If the question asks for "all employees" or a directory, list all employees found in the context.
3. If the question asks about a specific team/department, provide only employees from that team.
4. If the question asks about company policies, services, technologies, or general knowledge, answer from the context.
5. Do NOT guess or invent information. If the answer is not in the context, say: "I don't have this information in the company knowledge base."
6. If the context contains multiple employee records but the question asks about ONE specific person, return ONLY that person's record — never return all records.
7. Be concise and accurate. Format employee details clearly with labels.

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