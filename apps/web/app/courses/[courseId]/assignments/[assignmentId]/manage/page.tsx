"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, MapPin, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingsApi } from "@/lib/api/bookings";
import { slotsApi } from "@/lib/api/slots";
import { useAuth } from "@/lib/hooks/use-auth";

const STATUS_LABELS: Record<string, string> = {
	booked: "Booked",
	completed: "Completed",
	no_show: "No Show",
	cancelled_by_student: "Cancelled by Student",
	cancelled_by_ta: "Cancelled by TA",
};

export default function ManageSlotsPage() {
	const { assignmentId } = useParams<{
		assignmentId: string;
	}>();
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
	const [editingVenue, setEditingVenue] = useState<{
		slotId: string;
		venue: string;
	} | null>(null);

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
	}, [authLoading, user, router]);

	const { data: slots, isLoading } = useQuery({
		queryKey: ["slots", assignmentId],
		queryFn: async () => {
			const res = await slotsApi.list(assignmentId);
			return res.data.slots;
		},
		enabled: !!user && !!assignmentId,
	});

	const { data: slotBookings } = useQuery({
		queryKey: ["slot-bookings", selectedSlot],
		queryFn: async () => {
			if (!selectedSlot) return [];
			const res = await slotsApi.getBookings(selectedSlot);
			return res.data.bookings;
		},
		enabled: !!selectedSlot,
	});

	const generateMutation = useMutation({
		mutationFn: () => slotsApi.generate(assignmentId),
		onSuccess: (res) => {
			toast.success(`Generated ${res.data.count} slots`);
			queryClient.invalidateQueries({ queryKey: ["slots", assignmentId] });
		},
		onError: () => toast.error("Failed to generate slots"),
	});

	const publishMutation = useMutation({
		mutationFn: (slotId: string) =>
			slotsApi.update(slotId, { status: "published" }),
		onSuccess: () => {
			toast.success("Slot published");
			queryClient.invalidateQueries({ queryKey: ["slots", assignmentId] });
		},
	});

	const updateVenueMutation = useMutation({
		mutationFn: ({ slotId, venue }: { slotId: string; venue: string }) =>
			slotsApi.update(slotId, { venue }),
		onSuccess: () => {
			toast.success("Venue updated");
			setEditingVenue(null);
			queryClient.invalidateQueries({ queryKey: ["slots", assignmentId] });
		},
	});

	const updateBookingStatusMutation = useMutation({
		mutationFn: ({
			bookingId,
			status,
		}: {
			bookingId: string;
			status: "completed" | "no_show";
		}) => bookingsApi.updateStatus(bookingId, { status }),
		onSuccess: () => {
			toast.success("Status updated");
			queryClient.invalidateQueries({
				queryKey: ["slot-bookings", selectedSlot],
			});
		},
	});

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<Skeleton className="mb-4 h-8 w-64" />
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{[1, 2, 3, 4, 5, 6].map((i) => (
							<Skeleton key={i} className="h-24 rounded-lg" />
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
				<div className="mb-6 flex items-center gap-4">
					<Button variant="ghost" size="icon" onClick={() => router.back()}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<div>
						<h1 className="text-2xl font-bold">Slot Management</h1>
						<p className="text-sm text-muted-foreground">
							Manage slots, venues, and bookings
						</p>
					</div>
				</div>

				<div className="mb-6 flex gap-2">
					<Button
						onClick={() => generateMutation.mutate()}
						disabled={generateMutation.isPending}
					>
						{generateMutation.isPending ? "Generating..." : "Generate Slots"}
					</Button>
				</div>

				<div className="grid gap-6 lg:grid-cols-3">
					<div className="space-y-4 lg:col-span-2">
						<div className="grid gap-4 md:grid-cols-2">
							{slots?.map((slot) => (
								<Card
									key={slot.id}
									className={`cursor-pointer transition-colors hover:bg-muted/50 ${
										selectedSlot === slot.id ? "ring-2 ring-primary" : ""
									}`}
									onClick={() => setSelectedSlot(slot.id)}
								>
									<CardHeader className="pb-2">
										<div className="flex items-start justify-between">
											<div>
												<CardTitle className="text-sm">
													{format(new Date(slot.startsAt), "MMM d")}
												</CardTitle>
												<CardDescription className="text-xs">
													{format(new Date(slot.startsAt), "HH:mm")} -{" "}
													{format(new Date(slot.endsAt), "HH:mm")}
												</CardDescription>
											</div>
											<Badge
												variant={
													slot.status === "published" ? "default" : "secondary"
												}
											>
												{slot.status}
											</Badge>
										</div>
									</CardHeader>
									<CardContent>
										<div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
											<MapPin className="h-3 w-3" />
											{editingVenue?.slotId === slot.id ? (
												<div className="flex gap-1">
													<Input
														value={editingVenue.venue}
														onChange={(e) =>
															setEditingVenue({
																...editingVenue,
																venue: e.target.value,
															})
														}
														className="h-6 text-xs"
													/>
													<Button
														size="sm"
														variant="outline"
														className="h-6 text-xs"
														onClick={() =>
															updateVenueMutation.mutate({
																slotId: editingVenue.slotId,
																venue: editingVenue.venue,
															})
														}
													>
														Save
													</Button>
												</div>
											) : (
												<button
													type="button"
													className="hover:underline"
													onClick={() =>
														setEditingVenue({
															slotId: slot.id,
															venue: slot.venue ?? "",
														})
													}
												>
													{slot.venue || "No venue"}
												</button>
											)}
										</div>
										<div className="flex items-center gap-1 text-xs text-muted-foreground">
											<Users className="h-3 w-3" />
											{slot.bookedCount ?? 0} / {slot.capacity} booked
										</div>
										{slot.status === "draft" && (
											<Button
												size="sm"
												variant="outline"
												className="mt-2 w-full"
												onClick={(e) => {
													e.stopPropagation();
													publishMutation.mutate(slot.id);
												}}
											>
												Publish
											</Button>
										)}
									</CardContent>
								</Card>
							))}
							{(!slots || slots.length === 0) && (
								<Card className="col-span-full">
									<CardContent className="py-8 text-center text-muted-foreground">
										No slots yet. Generate some to get started.
									</CardContent>
								</Card>
							)}
						</div>
					</div>

					<div>
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Bookings</CardTitle>
								<CardDescription>
									{selectedSlot
										? "Select a booking to manage"
										: "Select a slot to view bookings"}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3">
								{slotBookings?.map((booking) => (
									<Card key={booking.id} className="p-3">
										<div className="mb-1 flex items-center justify-between">
											<span className="text-sm font-medium">
												{booking.student?.name ?? "Student"}
											</span>
											<Badge variant="outline" className="text-xs">
												{STATUS_LABELS[booking.status] ?? booking.status}
											</Badge>
										</div>
										{booking.student?.email && (
											<p className="text-xs text-muted-foreground">
												{booking.student.email}
											</p>
										)}
										{booking.status === "booked" && (
											<div className="mt-2 flex gap-1">
												<Button
													size="sm"
													variant="outline"
													className="text-xs"
													onClick={() =>
														updateBookingStatusMutation.mutate({
															bookingId: booking.id,
															status: "completed",
														})
													}
												>
													Complete
												</Button>
												<Button
													size="sm"
													variant="outline"
													className="text-xs"
													onClick={() =>
														updateBookingStatusMutation.mutate({
															bookingId: booking.id,
															status: "no_show",
														})
													}
												>
													No Show
												</Button>
											</div>
										)}
										{booking.status === "completed" && !booking.evaluation && (
											<Button
												size="sm"
												className="mt-2 w-full text-xs"
												onClick={() =>
													router.push(`/evaluations/${booking.assignmentId}`)
												}
											>
												Add Evaluation
											</Button>
										)}
									</Card>
								))}
								{selectedSlot &&
									(!slotBookings || slotBookings.length === 0) && (
										<p className="py-4 text-center text-sm text-muted-foreground">
											No bookings for this slot
										</p>
									)}
								{!selectedSlot && (
									<p className="py-4 text-center text-sm text-muted-foreground">
										Click a slot to view bookings
									</p>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</main>
		</div>
	);
}
