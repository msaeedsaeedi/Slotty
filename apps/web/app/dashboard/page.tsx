"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/hooks/use-auth";

export default function DashboardPage() {
	const { user, isLoading } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!isLoading && !user) {
			router.replace("/login");
		}
	}, [isLoading, user, router]);

	if (isLoading || !user) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	const roleLabel =
		user.role === "ta"
			? "Teaching Assistant"
			: user.role.charAt(0).toUpperCase() + user.role.slice(1);

	return (
		<div className="min-h-screen">
			<Header />
			<main className="container py-8">
				<h1 className="text-3xl font-bold mb-2">Welcome, {user.name}</h1>
				<p className="text-muted-foreground mb-8">
					You are logged in as {roleLabel}
				</p>

				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{user.role === "student" && (
						<>
							<Card
								className="cursor-pointer hover:bg-muted/50"
								onClick={() => router.push("/courses")}
							>
								<CardHeader>
									<CardTitle>My Courses</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										View your enrolled courses and book demo slots.
									</p>
								</CardContent>
							</Card>
							<Card
								className="cursor-pointer hover:bg-muted/50"
								onClick={() => router.push("/bookings")}
							>
								<CardHeader>
									<CardTitle>My Bookings</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										View and manage your active bookings.
									</p>
								</CardContent>
							</Card>
						</>
					)}
					{user.role === "ta" && (
						<Card
							className="cursor-pointer hover:bg-muted/50"
							onClick={() => router.push("/courses")}
						>
							<CardHeader>
								<CardTitle>My Courses</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Manage assignments, slots, and record evaluations.
								</p>
							</CardContent>
						</Card>
					)}
					{user.role === "instructor" && (
						<Card
							className="cursor-pointer hover:bg-muted/50"
							onClick={() => router.push("/courses")}
						>
							<CardHeader>
								<CardTitle>Course Overview</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Review evaluations and export data.
								</p>
							</CardContent>
						</Card>
					)}
					{user.role === "admin" && (
						<>
							<Card
								className="cursor-pointer hover:bg-muted/50"
								onClick={() => router.push("/admin/courses")}
							>
								<CardHeader>
									<CardTitle>Manage Courses</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										Create courses and manage enrollments.
									</p>
								</CardContent>
							</Card>
							<Card
								className="cursor-pointer hover:bg-muted/50"
								onClick={() => router.push("/admin/users")}
							>
								<CardHeader>
									<CardTitle>Manage Users</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-sm text-muted-foreground">
										Create and manage user accounts.
									</p>
								</CardContent>
							</Card>
						</>
					)}
				</div>
			</main>
		</div>
	);
}
