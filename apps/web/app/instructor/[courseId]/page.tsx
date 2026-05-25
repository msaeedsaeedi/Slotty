"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesApi } from "@/lib/api/courses";
import { evaluationsApi } from "@/lib/api/evaluations";
import { useAuth } from "@/lib/hooks/use-auth";

export default function InstructorReviewPage() {
	const { courseId } = useParams<{ courseId: string }>();
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const [selectedAssignment, setSelectedAssignment] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
	}, [authLoading, user, router]);

	const { data: courseData, isLoading: courseLoading } = useQuery({
		queryKey: ["instructor-course", courseId],
		queryFn: async () => {
			const res = await coursesApi.get(courseId);
			return res.data.course;
		},
		enabled: !!user && !!courseId,
	});

	const assignments = courseData?.assignments ?? [];
	const selectedAssignmentData = assignments.find(
		(a) => a.id === selectedAssignment,
	);

	const { data: evaluations, isLoading: evalsLoading } = useQuery({
		queryKey: ["instructor-evaluations", courseId, selectedAssignment],
		queryFn: async () => {
			const res = await evaluationsApi.byCourse(courseId, {
				assignmentId: selectedAssignment ?? undefined,
			});
			return res.data.evaluations;
		},
		enabled: !!user && !!courseId,
	});

	const handleExport = (format: "csv" | "json") => {
		const params = new URLSearchParams({ format });
		if (selectedAssignment) params.set("assignment_id", selectedAssignment);
		window.open(
			`/api/v1/courses/${courseId}/export?${params.toString()}`,
			"_blank",
		);
		toast.success(`Exporting as ${format.toUpperCase()}`);
	};

	if (authLoading || courseLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<Skeleton className="mb-4 h-8 w-64" />
					<Skeleton className="mb-8 h-48 rounded-lg" />
					<Skeleton className="h-64 rounded-lg" />
				</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<Header />
			<main className="container py-8">
				<div className="mb-6 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={() => router.back()}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="text-2xl font-bold">
								{courseData?.code}: {courseData?.title}
							</h1>
							<p className="text-sm text-muted-foreground">
								Course Overview & Export
							</p>
						</div>
					</div>
				</div>

				<div className="mb-6">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Assignments</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2">
								<Button
									variant={!selectedAssignment ? "default" : "outline"}
									size="sm"
									onClick={() => setSelectedAssignment(null)}
								>
									All
								</Button>
								{assignments.map((a) => (
									<Button
										key={a.id}
										variant={
											selectedAssignment === a.id ? "default" : "outline"
										}
										size="sm"
										onClick={() => setSelectedAssignment(a.id)}
									>
										{a.title}
									</Button>
								))}
							</div>
						</CardContent>
					</Card>
				</div>

				<div className="mb-6 flex gap-2">
					<Button variant="outline" onClick={() => handleExport("csv")}>
						<FileSpreadsheet className="mr-1 h-4 w-4" />
						Export CSV
					</Button>
					<Button variant="outline" onClick={() => handleExport("json")}>
						<Download className="mr-1 h-4 w-4" />
						Export JSON
					</Button>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							{selectedAssignmentData
								? `Evaluations — ${selectedAssignmentData.title}`
								: "All Evaluations"}
						</CardTitle>
						<CardDescription>
							Only submitted evaluations are visible
						</CardDescription>
					</CardHeader>
					<CardContent>
						{evalsLoading ? (
							<div className="space-y-3">
								{[1, 2, 3].map((i) => (
									<Skeleton key={i} className="h-16 rounded-lg" />
								))}
							</div>
						) : evaluations && evaluations.length > 0 ? (
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b text-left">
											<th className="py-2 font-medium">Student</th>
											<th className="py-2 font-medium">Assignment</th>
											<th className="py-2 font-medium">Score</th>
											<th className="py-2 font-medium">Submitted</th>
										</tr>
									</thead>
									<tbody>
										{evaluations.map((ev) => (
											<tr key={ev.id} className="border-b">
												<td className="py-2">
													{/* Evaluation doesn't have student directly in this view */}
													Evaluation #{ev.id.slice(0, 8)}
												</td>
												<td className="py-2">{/* Same */}—</td>
												<td className="py-2 font-medium">
													{ev.totalScore ?? "—"}
												</td>
												<td className="py-2 text-muted-foreground">
													{ev.submittedAt
														? format(new Date(ev.submittedAt), "MMM d, yyyy")
														: "—"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="py-4 text-center text-muted-foreground">
								No submitted evaluations yet.
							</p>
						)}
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
