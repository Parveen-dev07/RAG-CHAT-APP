import crypto from "crypto";
import fs from "fs";
import path from "path";

export type EmployeeCredential = { employeeId: string; employeeName: string; password: string; role: string };
const EMPLOYEE_DOCUMENT_DIR = path.join(process.cwd(), "data", "document", "company");
const SESSION_COOKIE = "employee_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
function cleanValue(value: string) { return value.replace(/^\*\*|\*\*$/g, "").trim(); }
export function getEmployeeCredentials(): EmployeeCredential[] {
  const employees: EmployeeCredential[] = [];
  for (const file of fs.readdirSync(EMPLOYEE_DOCUMENT_DIR).filter((file) => file.endsWith(".txt"))) {
    // Some older records use Markdown labels such as **1. Employee Unique ID:**.
    // Normalize them before parsing so every employee can sign in consistently.
    const text = fs.readFileSync(path.join(EMPLOYEE_DOCUMENT_DIR, file), "utf8")
      .replace(/\*\*(?:\d+\.\s*)?([^*:\r\n]+):\*\*/g, "$1:");
    for (const record of text.split(/(?=(?:\*\*)?Employee Unique ID(?:\*\*)?\s*:)/i)) {
      const employeeId = record.match(/(?:\*\*)?Employee Unique ID(?:\*\*)?\s*:\s*(GEEK-EMP-\d+)/i)?.[1]?.toUpperCase();
      const employeeName = record.match(/(?:\*\*)?Employee Name(?:\*\*)?\s*:\s*([^\r\n]+)/i)?.[1];
      const password = record.match(/(?:\*\*)?Password(?:\*\*)?\s*:\s*([^\r\n]+)/i)?.[1];
      const role = record.match(/(?:\*\*)?Role(?:\*\*)?\s*:\s*([^\r\n]+)/i)?.[1];
      if (employeeId && employeeName && password) employees.push({ employeeId, employeeName: cleanValue(employeeName), password: cleanValue(password), role: cleanValue(role || "Employee") });
    }
  }
  return employees;
}

/** Returns the current source record for an authenticated profile. This keeps
 * profile access available while Chroma is being re-ingested. */
export function getEmployeeProfile(employeeId: string) {
  for (const file of fs.readdirSync(EMPLOYEE_DOCUMENT_DIR).filter((file) => file.endsWith(".txt"))) {
    const text = fs.readFileSync(path.join(EMPLOYEE_DOCUMENT_DIR, file), "utf8")
      .replace(/\*\*(?:\d+\.\s*)?([^*:\r\n]+):\*\*/g, "$1:");
    const records = text.split(/(?=Employee Unique ID\s*:)/i);
    const record = records.find((item) =>
      new RegExp(`Employee Unique ID\\s*:\\s*${employeeId}`, "i").test(item)
    );
    if (record) return redactPassword(record).trim();
  }
  return null;
}

/** Returns the current source record for an employee by name. This keeps
 * profile access available while Chroma is being re-ingested. Supports
 * partial name matching so "Anwar" matches "Anwar khan". */
export function getEmployeeProfileByName(employeeName: string) {
  const normalizedName = employeeName.trim().toLowerCase();
  for (const file of fs.readdirSync(EMPLOYEE_DOCUMENT_DIR).filter((file) => file.endsWith(".txt"))) {
    const text = fs.readFileSync(path.join(EMPLOYEE_DOCUMENT_DIR, file), "utf8")
      .replace(/\*\*(?:\d+\.\s*)?([^*:\r\n]+):\*\*/g, "$1:");
    const records = text.split(/(?=Employee Unique ID\s*:)/i);
    const record = records.find((item) => {
      const name = item.match(/Employee Name\s*:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
      if (!name) return false;
      return name === normalizedName || name.startsWith(normalizedName) || normalizedName.startsWith(name);
    });
    if (record) return redactPassword(record).trim();
  }
  return null;
}
function safeEqual(a: string, b: string) {
  const hashA = new Uint8Array(crypto.createHash("sha256").update(a).digest());
  const hashB = new Uint8Array(crypto.createHash("sha256").update(b).digest());
  return crypto.timingSafeEqual(hashA, hashB);
}
export function findEmployee(identifier: string, password: string) {
  const value = identifier.trim().toLowerCase();
  const employee = getEmployeeCredentials().find((candidate) => candidate.employeeId.toLowerCase() === value || candidate.employeeName.toLowerCase() === value);
  return employee && safeEqual(employee.password, password) ? { employeeId: employee.employeeId, employeeName: employee.employeeName, role: employee.role } : null;
}

export function getEmployeeById(employeeId: string) {
  const employee = getEmployeeCredentials().find(
    (candidate) => candidate.employeeId === employeeId
  );
  return employee
    ? {
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        role: employee.role,
      }
    : null;
}
function sessionSecret() { return process.env.EMPLOYEE_SESSION_SECRET || "local-development-secret-change-me"; }
export function createEmployeeSession(employee: Pick<EmployeeCredential, "employeeId" | "role">) {
  const payload = Buffer.from(JSON.stringify({ ...employee, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url")}`;
}
export function getEmployeeSession(cookieValue?: string) {
  if (!cookieValue) return null;
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature || !safeEqual(crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url"), signature)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof session.employeeId === "string" && typeof session.role === "string" && session.expiresAt > Date.now() ? session : null;
  } catch { return null; }
}
export const employeeSessionCookie = { name: SESSION_COOKIE, maxAge: SESSION_TTL_SECONDS };
export function redactPassword(text: string) { return text.replace(/^\s*(?:\*\*)?Password(?:\*\*)?\s*:\s*.*(?:\r?\n)?/gim, ""); }

export function getAllEmployeeProfiles() {
  return getEmployeeCredentials()
    .map((employee) => getEmployeeProfile(employee.employeeId))
    .filter((profile): profile is string => Boolean(profile));
}

export function getEmployeeDirectory() {
  return getEmployeeCredentials()
    .map(({ employeeId, employeeName }) => ({ employeeId, employeeName }))
    .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
}

export function getEmployeeProfilesByRole(roles: string[]) {
  const allowedRoles = new Set(roles.map((role) => role.toLowerCase()));
  return getEmployeeCredentials()
    .filter((employee) => allowedRoles.has(employee.role.toLowerCase()))
    .map((employee) => getEmployeeProfile(employee.employeeId))
    .filter((profile): profile is string => Boolean(profile));
}

/** Gets all employee records from one role/team source file without relying on
 * a potentially stale Chroma collection. */
export function getEmployeeProfilesFromSource(source: string, roles?: string[]) {
  const filePath = path.join(process.cwd(), "data", source);
  if (!fs.existsSync(filePath)) return [];
  const allowedRoles = roles
    ? new Set(roles.map((role) => role.toLowerCase()))
    : null;
  const text = fs.readFileSync(filePath, "utf8")
    .replace(/\*\*(?:\d+\.\s*)?([^*:\r\n]+):\*\*/g, "$1:");
  return text
    .split(/(?=Employee Unique ID\s*:)/i)
    .filter((record) => /Employee Unique ID\s*:\s*GEEK-EMP-\d+/i.test(record))
    .filter((record) => {
      if (!allowedRoles) return true;
      const role = record.match(/Role\s*:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
      return role ? allowedRoles.has(role) : false;
    })
    .map((record) => redactPassword(record).trim())
    .filter(Boolean);
}
