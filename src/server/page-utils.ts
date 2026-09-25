import "server-only";
import { notFound } from "next/navigation";
import { DomainError } from "@/domain/result";

/** Await a service call from a page, turning access/not-found errors into a 404. */
export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof DomainError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}
