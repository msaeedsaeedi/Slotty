"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Header } from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { notificationsApi } from "@/lib/api/notifications";
import { useAuth } from "@/lib/hooks/use-auth";

export default function NotificationsPage() {
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
	}, [authLoading, user, router]);

	const { data, isLoading } = useQuery({
		queryKey: ["notifications"],
		queryFn: async () => {
			const res = await notificationsApi.list();
			return res.data;
		},
		enabled: !!user,
	});

	const markAllMutation = useMutation({
		mutationFn: () => notificationsApi.markAllRead(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});

	const markReadMutation = useMutation({
		mutationFn: (id: string) => notificationsApi.markRead(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications"] });
		},
	});

	const unreadCount = data?.notifications?.filter((n) => !n.readAt).length ?? 0;

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<h1 className="mb-6 text-2xl font-bold">Notifications</h1>
					<div className="space-y-4">
						{[1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-20 rounded-lg" />
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
					<h1 className="text-2xl font-bold">Notifications</h1>
					{unreadCount > 0 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => markAllMutation.mutate()}
							disabled={markAllMutation.isPending}
						>
							<CheckCheck className="mr-1 h-4 w-4" />
							Mark all read
						</Button>
					)}
				</div>

				{data?.notifications && data.notifications.length > 0 ? (
					<div className="space-y-3">
						{data.notifications.map((notification) => (
							<Card
								key={notification.id}
								className={`cursor-pointer transition-colors ${
									!notification.readAt ? "border-primary/50 bg-primary/5" : ""
								}`}
								onClick={() => {
									if (!notification.readAt)
										markReadMutation.mutate(notification.id);
								}}
							>
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between">
										<div className="flex items-center gap-2">
											<Bell className="h-4 w-4 text-muted-foreground" />
											<CardTitle className="text-base">
												{notification.title}
											</CardTitle>
										</div>
										{!notification.readAt && (
											<Badge variant="default" className="text-xs">
												New
											</Badge>
										)}
									</div>
									<CardDescription>
										{format(new Date(notification.createdAt), "MMM d, HH:mm")}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<p className="text-sm">{notification.body}</p>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<Card>
						<CardContent className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
							<Bell className="h-8 w-8" />
							<p>No notifications yet.</p>
						</CardContent>
					</Card>
				)}
			</main>
		</div>
	);
}
