"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesApi } from "@/lib/api/courses";
import { useAuth } from "@/lib/hooks/use-auth";

export default function AdminCoursesPage() {
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [showCreate, setShowCreate] = useState(false);

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
		if (!authLoading && user && user.role !== "admin")
			router.replace("/dashboard");
	}, [authLoading, user, router]);

	const { data, isLoading } = useQuery({
		queryKey: ["admin-courses"],
		queryFn: async () => {
			const res = await coursesApi.list();
			return res.data;
		},
		enabled: user?.role === "admin",
	});

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<h1 className="mb-6 text-2xl font-bold">Manage Courses</h1>
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
				<div className="mb-6 flex items-center justify-between">
					<h1 className="text-2xl font-bold">Manage Courses</h1>
					<Dialog open={showCreate} onOpenChange={setShowCreate}>
						<DialogTrigger>
							<Button>
								<Plus className="mr-1 h-4 w-4" />
								Create Course
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Create New Course</DialogTitle>
							</DialogHeader>
							<CreateCourseForm
								onSuccess={() => {
									setShowCreate(false);
									queryClient.invalidateQueries({
										queryKey: ["admin-courses"],
									});
								}}
							/>
						</DialogContent>
					</Dialog>
				</div>

				{data?.courses && data.courses.length > 0 ? (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{data.courses.map((course) => (
							<Card
								key={course.id}
								className="cursor-pointer transition-colors hover:bg-muted/50"
								onClick={() => router.push(`/admin/courses/${course.id}`)}
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
							No courses created yet.
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}

function CreateCourseForm({ onSuccess }: { onSuccess: () => void }) {
	const [code, setCode] = useState("");
	const [title, setTitle] = useState("");
	const [term, setTerm] = useState("");

	const mutation = useMutation({
		mutationFn: async () => {
			await coursesApi.create({
				code,
				title,
				term,
				owner_id: "", // Will be set by backend
			});
		},
		onSuccess: () => {
			toast.success("Course created");
			onSuccess();
		},
		onError: () => toast.error("Failed to create course"),
	});

	return (
		<div className="space-y-4">
			<div>
				<Label>Course Code</Label>
				<Input
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder="CS101"
				/>
			</div>
			<div>
				<Label>Title</Label>
				<Input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Introduction to CS"
				/>
			</div>
			<div>
				<Label>Term</Label>
				<Input
					value={term}
					onChange={(e) => setTerm(e.target.value)}
					placeholder="2026-S1"
				/>
			</div>
			<Button
				onClick={() => mutation.mutate()}
				disabled={mutation.isPending}
				className="w-full"
			>
				{mutation.isPending ? "Creating..." : "Create Course"}
			</Button>
		</div>
	);
}
