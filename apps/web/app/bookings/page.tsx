"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { bookingsApi } from "@/lib/api/bookings";
import { slotsApi } from "@/lib/api/slots";
import { useAuth } from "@/lib/hooks/use-auth";
import type { Booking } from "@/lib/types";

const STATUS_COLORS: Record<
	string,
	"default" | "secondary" | "outline" | "destructive"
> = {
	booked: "default",
	completed: "secondary",
	no_show: "destructive",
	cancelled_by_student: "outline",
	cancelled_by_ta: "outline",
};

const STATUS_LABELS: Record<string, string> = {
	booked: "Booked",
	completed: "Completed",
	no_show: "No Show",
	cancelled_by_student: "Cancelled",
	cancelled_by_ta: "Cancelled by TA",
};

export default function BookingsPage() {
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
	const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(
		null,
	);
	const [cancelReason, setCancelReason] = useState("");
	const [cancelNote, setCancelNote] = useState("");

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
	}, [authLoading, user, router]);

	const { data, isLoading } = useQuery({
		queryKey: ["bookings"],
		queryFn: async () => {
			const res = await bookingsApi.list();
			return res.data.bookings;
		},
		enabled: !!user,
	});

	const cancelMutation = useMutation({
		mutationFn: async (bookingId: string) => {
			await bookingsApi.cancel(bookingId, {
				cancel_reason: cancelReason === "other" ? "other" : cancelReason,
				cancel_note: cancelReason === "other" ? cancelNote : undefined,
			});
		},
		onSuccess: () => {
			toast.success("Booking cancelled");
			queryClient.invalidateQueries({ queryKey: ["bookings"] });
			setCancelBooking(null);
			setCancelReason("");
			setCancelNote("");
		},
		onError: () => toast.error("Failed to cancel booking"),
	});

	const rescheduleMutation = useMutation({
		mutationFn: ({
			bookingId,
			newSlotId,
		}: {
			bookingId: string;
			newSlotId: string;
		}) => bookingsApi.reschedule(bookingId, newSlotId),
		onSuccess: () => {
			toast.success("Booking rescheduled");
			queryClient.invalidateQueries({ queryKey: ["bookings"] });
			setRescheduleBooking(null);
		},
		onError: () => toast.error("Failed to reschedule"),
	});

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<h1 className="mb-6 text-2xl font-bold">My Bookings</h1>
					<div className="grid gap-4">
						{[1, 2, 3].map((i) => (
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
				<h1 className="mb-6 text-2xl font-bold">My Bookings</h1>
				{data && data.length > 0 ? (
					<div className="grid gap-4">
						{data.map((booking) => (
							<Card key={booking.id}>
								<CardHeader className="pb-2">
									<div className="flex items-start justify-between">
										<div>
											<CardTitle className="text-lg">
												{booking.assignment?.title ?? "Assignment"}
											</CardTitle>
											<CardDescription>
												{booking.slot && (
													<span className="flex items-center gap-1">
														<Calendar className="h-3 w-3" />
														{format(
															new Date(booking.slot.startsAt),
															"MMM d, yyyy",
														)}
														{" — "}
														<Clock className="h-3 w-3" />
														{format(new Date(booking.slot.startsAt), "HH:mm")} -{" "}
														{format(new Date(booking.slot.endsAt), "HH:mm")}
													</span>
												)}
											</CardDescription>
										</div>
										<Badge
											variant={STATUS_COLORS[booking.status] ?? "secondary"}
										>
											{STATUS_LABELS[booking.status] ?? booking.status}
										</Badge>
									</div>
								</CardHeader>
								<CardContent>
									{booking.slot?.venue && (
										<div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
											<MapPin className="h-3 w-3" />
											{booking.slot.venue}
										</div>
									)}
									{booking.cancelReason && (
										<p className="mb-2 text-sm text-muted-foreground">
											Reason: {booking.cancelReason}
											{booking.cancelNote && ` — ${booking.cancelNote}`}
										</p>
									)}
									{booking.status === "booked" && (
										<div className="flex gap-2">
											<Button
												size="sm"
												variant="outline"
												onClick={() => setRescheduleBooking(booking)}
											>
												Reschedule
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => setCancelBooking(booking)}
											>
												Cancel
											</Button>
										</div>
									)}
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<Card>
						<CardContent className="py-8 text-center text-muted-foreground">
							No bookings yet. Browse courses to find available slots.
						</CardContent>
					</Card>
				)}

				<Dialog
					open={!!cancelBooking}
					onOpenChange={(open) => !open && setCancelBooking(null)}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Cancel Booking</DialogTitle>
						</DialogHeader>
						<div className="space-y-4">
							<div>
								<Label>Reason</Label>
								<Select
									value={cancelReason}
									onValueChange={(v) => setCancelReason(v ?? "")}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a reason" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="slot_conflict">
											Schedule conflict
										</SelectItem>
										<SelectItem value="no_longer_needed">
											No longer needed
										</SelectItem>
										<SelectItem value="other">Other</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{cancelReason === "other" && (
								<div>
									<Label>Note (required)</Label>
									<Textarea
										value={cancelNote}
										onChange={(e) => setCancelNote(e.target.value)}
										placeholder="Please explain why..."
									/>
								</div>
							)}
							<Button
								variant="destructive"
								className="w-full"
								onClick={() =>
									cancelBooking && cancelMutation.mutate(cancelBooking.id)
								}
								disabled={
									cancelMutation.isPending ||
									!cancelReason ||
									(cancelReason === "other" && cancelNote.length < 10)
								}
							>
								{cancelMutation.isPending
									? "Cancelling..."
									: "Confirm Cancellation"}
							</Button>
						</div>
					</DialogContent>
				</Dialog>

				<RescheduleDialog
					booking={rescheduleBooking}
					onClose={() => setRescheduleBooking(null)}
					onReschedule={(newSlotId) =>
						rescheduleBooking &&
						rescheduleMutation.mutate({
							bookingId: rescheduleBooking.id,
							newSlotId,
						})
					}
					isLoading={rescheduleMutation.isPending}
				/>
			</main>
		</div>
	);
}

function RescheduleDialog({
	booking,
	onClose,
	onReschedule,
	isLoading,
}: {
	booking: Booking | null;
	onClose: () => void;
	onReschedule: (newSlotId: string) => void;
	isLoading: boolean;
}) {
	const [selectedSlot, setSelectedSlot] = useState("");

	const { data: slotsData } = useQuery({
		queryKey: ["slots", booking?.assignmentId],
		queryFn: async () => {
			if (!booking?.assignmentId) return null;
			const res = await slotsApi.list(booking.assignmentId);
			return res.data.slots.filter(
				(s) => s.status === "published" && (s.bookedCount ?? 0) < s.capacity,
			);
		},
		enabled: !!booking?.assignmentId,
	});

	return (
		<Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reschedule Booking</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div>
						<Label>Select new slot</Label>
						<Select
							value={selectedSlot}
							onValueChange={(v) => setSelectedSlot(v ?? "")}
						>
							<SelectTrigger>
								<SelectValue placeholder="Choose a slot" />
							</SelectTrigger>
							<SelectContent>
								{slotsData?.map((slot) => (
									<SelectItem key={slot.id} value={slot.id}>
										{format(new Date(slot.startsAt), "MMM d, HH:mm")} -{" "}
										{format(new Date(slot.endsAt), "HH:mm")} (
										{slot.venue ?? "TBD"})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button
						className="w-full"
						onClick={() => onReschedule(selectedSlot)}
						disabled={isLoading || !selectedSlot}
					>
						{isLoading ? "Rescheduling..." : "Confirm Reschedule"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
