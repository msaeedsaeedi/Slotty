import "server-only";
import { notFound } from "next/navigation";
import { DomainError } from "@/domain/result";
import { requireUser } from "@/server/auth/session";
import { getAssignment } from "@/server/services/assignments";
import { getCourseForActor } from "@/server/services/courses";

/** Await a service call from a page, turning access/not-found errors into a 404. */
export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof DomainError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}

/**
 * Tab titles for course and assignment pages ("QA Test Lab 2 Viva · Slotty"),
 * through the same access checks as the page; anyone without access gets the
 * plain default, so titles never leak.
 */
export async function courseTitle(courseId: string, prefix?: string): Promise<{ title?: string }> {
  try {
    const { course } = await getCourseForActor(await requireUser(), courseId);
    return { title: [prefix, course.code].filter(Boolean).join(" · ") };
  } catch {
    return {};
  }
}

export async function assignmentTitle(assignmentId: string): Promise<{ title?: string }> {
  try {
    const { assignment } = await getAssignment(await requireUser(), assignmentId);
    return { title: `${assignment.title} · ${assignment.course.code}` };
  } catch {
    return {};
  }
}
