import { NextRequest, NextResponse } from "next/server";
import {
  createEmployeeSession,
  employeeSessionCookie,
  findEmployee,
  getEmployeeById,
  getEmployeeSession,
} from "@/lib/employee-auth";

export function GET(req: NextRequest) {
  const session = getEmployeeSession(
    req.cookies.get(employeeSessionCookie.name)?.value
  );
  const employee = session ? getEmployeeById(session.employeeId) : null;

  if (!employee) {
    return NextResponse.json({ employee: null });
  }

  return NextResponse.json({ employee });
}

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();
    if (typeof identifier !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Employee ID or name and password are required." },
        { status: 400 }
      );
    }
    const employee = findEmployee(identifier, password);
    if (!employee) {
      return NextResponse.json(
        { error: "Invalid employee ID/name or password." },
        { status: 401 }
      );
    }
    const response = NextResponse.json({ employee });
    response.cookies.set(
      employeeSessionCookie.name,
      createEmployeeSession(employee),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: employeeSessionCookie.maxAge,
      }
    );
    return response;
  } catch {
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}

export function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(employeeSessionCookie.name, "", { path: "/", maxAge: 0 });
  return response;
}
