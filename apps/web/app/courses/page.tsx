"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesApi } from "@/lib/api/courses";
import { useAuth } from "@/lib/hooks/use-auth";

export default function CoursesPage() {
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!authLoading && !user) {
			router.replace("/login");
		}
	}, [authLoading, user, router]);

	const { data, isLoading } = useQuery({
		queryKey: ["courses"],
		queryFn: async () => {
			const res = await coursesApi.list();
			return res.data;
		},
		enabled: !!user,
	});

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<h1 className="mb-6 text-2xl font-bold">Courses</h1>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{[1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-32 rounded-lg" />
						))}
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<Header />
			<main className="container py-8">
				<h1 className="mb-6 text-2xl font-bold">Courses</h1>
				{data?.courses && data.courses.length > 0 ? (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{data.courses.map((course) => (
							<Card
								key={course.id}
								className="cursor-pointer transition-colors hover:bg-muted/50"
								onClick={() => router.push(`/courses/${course.id}`)}
							>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<BookOpen className="h-5 w-5" />
										{course.code}
									</CardTitle>
									<CardDescription>{course.title}</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">{course.term}</p>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<Card>
						<CardContent className="py-8 text-center text-muted-foreground">
							No courses found.
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}
