"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { adminApi } from "@/lib/api/admin";
import { useAuth } from "@/lib/hooks/use-auth";

export default function AdminUsersPage() {
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [emailFilter, setEmailFilter] = useState("");
	const [showCreate, setShowCreate] = useState(false);

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
		if (!authLoading && user && user.role !== "admin")
			router.replace("/dashboard");
	}, [authLoading, user, router]);

	const { data, isLoading } = useQuery({
		queryKey: ["admin-users", emailFilter],
		queryFn: async () => {
			const res = await adminApi.listUsers(emailFilter || undefined);
			return res.data.users;
		},
		enabled: user?.role === "admin",
	});

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<h1 className="mb-6 text-2xl font-bold">Manage Users</h1>
					<div className="space-y-4">
						{[1, 2, 3, 4, 5].map((i) => (
							<Skeleton key={i} className="h-16 rounded-lg" />
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
				<div className="mb-6 flex items-center justify-between gap-4">
					<h1 className="text-2xl font-bold">Manage Users</h1>
					<div className="flex gap-2">
						<div className="relative">
							<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search by email..."
								value={emailFilter}
								onChange={(e) => setEmailFilter(e.target.value)}
								className="pl-8"
							/>
						</div>
						<Dialog open={showCreate} onOpenChange={setShowCreate}>
							<DialogTrigger>
								<Button>
									<Plus className="mr-1 h-4 w-4" />
									Create User
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Create New User</DialogTitle>
								</DialogHeader>
								<CreateUserForm
									onSuccess={() => {
										setShowCreate(false);
										queryClient.invalidateQueries({
											queryKey: ["admin-users"],
										});
									}}
								/>
							</DialogContent>
						</Dialog>
					</div>
				</div>

				{data && data.length > 0 ? (
					<div className="space-y-3">
						{data.map((u) => (
							<Card key={u.id}>
								<CardContent className="flex items-center justify-between py-4">
									<div>
										<p className="font-medium">{u.name}</p>
										<p className="text-sm text-muted-foreground">{u.email}</p>
									</div>
									<div className="flex items-center gap-2">
										{u.rollNumber && (
											<span className="text-xs text-muted-foreground">
												ID: {u.rollNumber}
											</span>
										)}
										<Badge variant="secondary">{u.role}</Badge>
										<Badge
											variant={u.status === "active" ? "default" : "outline"}
										>
											{u.status}
										</Badge>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<Card>
						<CardContent className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
							<Users className="h-8 w-8" />
							<p>No users found.</p>
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}

function CreateUserForm({ onSuccess }: { onSuccess: () => void }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState("student");
	const [rollNumber, setRollNumber] = useState("");

	const mutation = useMutation({
		mutationFn: () =>
			adminApi.createUser({
				name,
				email,
				role,
				roll_number: rollNumber || undefined,
			}),
		onSuccess: () => {
			toast.success("User created");
			onSuccess();
		},
		onError: () => toast.error("Failed to create user"),
	});

	return (
		<div className="space-y-4">
			<div>
				<Label>Name</Label>
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Alice Smith"
				/>
			</div>
			<div>
				<Label>Email</Label>
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="alice@university.edu"
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
						<SelectItem value="instructor">Instructor</SelectItem>
						<SelectItem value="admin">Admin</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div>
				<Label>Roll Number (optional)</Label>
				<Input
					value={rollNumber}
					onChange={(e) => setRollNumber(e.target.value)}
					placeholder="2024-001"
				/>
			</div>
			<Button
				onClick={() => mutation.mutate()}
				disabled={mutation.isPending || !name || !email}
				className="w-full"
			>
				{mutation.isPending ? "Creating..." : "Create User"}
			</Button>
		</div>
	);
}
