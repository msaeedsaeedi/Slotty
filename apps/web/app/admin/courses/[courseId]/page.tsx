"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, UserPlus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { coursesApi } from "@/lib/api/courses";
import { useAuth } from "@/lib/hooks/use-auth";

export default function AdminCourseDetailPage() {
	const { courseId } = useParams<{ courseId: string }>();
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [showEnroll, setShowEnroll] = useState(false);

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
		if (!authLoading && user && user.role !== "admin")
			router.replace("/dashboard");
	}, [authLoading, user, router]);

	const { data: courseData, isLoading } = useQuery({
		queryKey: ["admin-course", courseId],
		queryFn: async () => {
			const res = await coursesApi.get(courseId);
			return res.data.course;
		},
		enabled: user?.role === "admin" && !!courseId,
	});

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<Skeleton className="mb-4 h-8 w-64" />
					<Skeleton className="h-64 rounded-lg" />
				</main>
			</div>
		);
	}

	if (!courseData) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<Card>
						<CardContent className="py-8 text-center text-muted-foreground">
							Course not found.
						</CardContent>
					</Card>
				</main>
			</div>
		);
	}

	return (
		<div className="min-h-screen">
			<Header />
			<main className="container py-8">
				<h1 className="mb-1 text-2xl font-bold">
					{courseData.code}: {courseData.title}
				</h1>
				<p className="mb-6 text-sm text-muted-foreground">{courseData.term}</p>

				<div className="mb-6 flex gap-2">
					<Dialog open={showEnroll} onOpenChange={setShowEnroll}>
						<DialogTrigger>
							<Button variant="outline">
								<UserPlus className="mr-1 h-4 w-4" />
								Enroll User
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Enroll User</DialogTitle>
							</DialogHeader>
							<EnrollForm
								courseId={courseId}
								onSuccess={() => {
									setShowEnroll(false);
									queryClient.invalidateQueries({
										queryKey: ["admin-course", courseId],
									});
								}}
							/>
						</DialogContent>
					</Dialog>

					<BulkEnrollDialog
						courseId={courseId}
						onSuccess={() =>
							queryClient.invalidateQueries({
								queryKey: ["admin-course", courseId],
							})
						}
					/>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Course Details</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Code</span>
							<span className="font-medium">{courseData.code}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Title</span>
							<span className="font-medium">{courseData.title}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Term</span>
							<span className="font-medium">{courseData.term}</span>
						</div>
						<div className="flex justify-between text-sm">
							<span className="text-muted-foreground">Assignments</span>
							<span className="font-medium">
								{courseData.assignments?.length ?? 0}
							</span>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}

function EnrollForm({
	courseId,
	onSuccess,
}: {
	courseId: string;
	onSuccess: () => void;
}) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("student");

	const enrollMutation = useMutation({
		mutationFn: async () => {
			const usersRes = await fetch(
				`/api/v1/users?email=${encodeURIComponent(email)}`,
			);
			const { users } = await usersRes.json();
			if (!users || users.length === 0) {
				throw new Error("User not found");
			}
			await coursesApi.createEnrollment(courseId, {
				user_id: users[0].id,
				role_in_course: role,
			});
		},
		onSuccess: () => {
			toast.success("User enrolled");
			onSuccess();
		},
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to enroll"),
	});

	return (
		<div className="space-y-4">
			<div>
				<Label>User Email</Label>
				<Input
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="student@university.edu"
				/>
			</div>
			<div>
				<Label>Role</Label>
				<Select value={role} onValueChange={(v) => setRole(v ?? "student")}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="student">Student</SelectItem>
						<SelectItem value="ta">TA</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<Button
				onClick={() => enrollMutation.mutate()}
				disabled={enrollMutation.isPending || !email}
				className="w-full"
			>
				{enrollMutation.isPending ? "Enrolling..." : "Enroll"}
			</Button>
		</div>
	);
}

function BulkEnrollDialog({
	courseId,
	onSuccess,
}: {
	courseId: string;
	onSuccess: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);

	const bulkMutation = useMutation({
		mutationFn: async () => {
			if (!file) throw new Error("No file selected");
			await coursesApi.bulkEnroll(courseId, file);
		},
		onSuccess: () => {
			toast.success("Bulk enrollment processed");
			onSuccess();
		},
		onError: () => toast.error("Failed to process CSV"),
	});

	return (
		<Dialog>
			<DialogTrigger>
				<Button variant="outline">
					<Upload className="mr-1 h-4 w-4" />
					Bulk CSV Import
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Bulk Enroll from CSV</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Upload a CSV with columns: <code>email,role</code>
					</p>
					<div>
						<Label>CSV File</Label>
						<Input
							type="file"
							accept=".csv"
							onChange={(e) => setFile(e.target.files?.[0] ?? null)}
						/>
					</div>
					<Button
						onClick={() => bulkMutation.mutate()}
						disabled={bulkMutation.isPending || !file}
						className="w-full"
					>
						{bulkMutation.isPending ? "Processing..." : "Upload and Enroll"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
