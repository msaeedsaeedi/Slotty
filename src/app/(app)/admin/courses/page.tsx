import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminUser } from "@/server/auth/session";
import { adminListCourses } from "@/server/services/admin";

export const metadata = { title: "All courses" };

export default async function AdminCoursesPage() {
  const user = await requireAdminUser();
  const courses = await adminListCourses(user);
  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Course</TableHead>
            <TableHead className="hidden sm:table-cell">Created by</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Assignments</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {courses.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/courses/${c.id}/manage`} className="font-medium hover:underline">
                  {c.code} — {c.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {c.term} {c.archived && <StatusBadge status="ARCHIVED" label="Archived" />}
                </p>
              </TableCell>
              <TableCell className="hidden sm:table-cell">{c.createdBy.name}</TableCell>
              <TableCell>{c._count.enrollments}</TableCell>
              <TableCell>{c._count.assignments}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
