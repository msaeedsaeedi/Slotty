"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, MapPin, User } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { assignmentsApi } from "@/lib/api/assignments";
import { bookingsApi } from "@/lib/api/bookings";
import { coursesApi } from "@/lib/api/courses";
import { slotsApi } from "@/lib/api/slots";
import { useAuth } from "@/lib/hooks/use-auth";
import type { DemoSlot } from "@/lib/types";

export default function CourseDetailPage() {
	const { courseId } = useParams<{ courseId: string }>();
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
	}, [authLoading, user, router]);

	const { data: courseData, isLoading: courseLoading } = useQuery({
		queryKey: ["course", courseId],
		queryFn: async () => {
			const res = await coursesApi.get(courseId);
			return res.data.course;
		},
		enabled: !!user && !!courseId,
	});

	const [selectedAssignment, setSelectedAssignment] = useState<string | null>(
		null,
	);
	const [showNewAssignment, setShowNewAssignment] = useState(false);

	const { data: slotsData, isLoading: slotsLoading } = useQuery({
		queryKey: ["slots", selectedAssignment],
		queryFn: async () => {
			if (!selectedAssignment) return [];
			const res = await slotsApi.list(selectedAssignment);
			return res.data.slots;
		},
		enabled: !!selectedAssignment,
	});

	const bookMutation = useMutation({
		mutationFn: (slotId: string) => bookingsApi.create(slotId),
		onSuccess: () => {
			toast.success("Booking confirmed!");
			queryClient.invalidateQueries({ queryKey: ["slots"] });
		},
		onError: () => {
			toast.error(
				"Failed to book slot. It may be full or you already have a booking.",
			);
		},
	});

	const generateSlotsMutation = useMutation({
		mutationFn: () => {
			if (!selectedAssignment) throw new Error("No assignment selected");
			return slotsApi.generate(selectedAssignment);
		},
		onSuccess: (res) => {
			toast.success(`Generated ${res.data.count} slots`);
			queryClient.invalidateQueries({ queryKey: ["slots"] });
		},
		onError: () => toast.error("Failed to generate slots"),
	});

	const publishSlotMutation = useMutation({
		mutationFn: (slotId: string) =>
			slotsApi.update(slotId, { status: "published" }),
		onSuccess: () => {
			toast.success("Slot published");
			queryClient.invalidateQueries({ queryKey: ["slots"] });
		},
	});

	const venueChangeMutation = useMutation({
		mutationFn: ({ slotId, venue }: { slotId: string; venue: string }) =>
			slotsApi.update(slotId, { venue }),
		onSuccess: () => {
			toast.success("Venue updated");
			queryClient.invalidateQueries({ queryKey: ["slots"] });
		},
	});

	const isTa = user?.role === "ta" || user?.role === "admin";

	if (authLoading || courseLoading) {
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

				{isTa && (
					<div className="mb-6 flex gap-2">
						<Dialog
							open={showNewAssignment}
							onOpenChange={setShowNewAssignment}
						>
							<DialogTrigger>
								<Button>Create Assignment</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>New Assignment</DialogTitle>
								</DialogHeader>
								<CreateAssignmentForm
									courseId={courseId}
									onSuccess={() => {
										setShowNewAssignment(false);
										queryClient.invalidateQueries({
											queryKey: ["course", courseId],
										});
									}}
								/>
							</DialogContent>
						</Dialog>
					</div>
				)}

				<Tabs
					value={selectedAssignment ?? undefined}
					onValueChange={setSelectedAssignment}
				>
					<TabsList className="mb-6">
						{courseData.assignments?.map((a) => (
							<TabsTrigger key={a.id} value={a.id}>
								{a.title}
							</TabsTrigger>
						))}
					</TabsList>

					{selectedAssignment && isTa && (
						<div className="mb-4 flex gap-2">
							<Button
								variant="outline"
								onClick={() => generateSlotsMutation.mutate()}
								disabled={generateSlotsMutation.isPending}
							>
								{generateSlotsMutation.isPending
									? "Generating..."
									: "Generate Slots"}
							</Button>
							<Button
								variant="outline"
								onClick={() =>
									router.push(
										`/courses/${courseId}/assignments/${selectedAssignment}/manage`,
									)
								}
							>
								Manage Slots
							</Button>
						</div>
					)}

					{selectedAssignment && (
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{slotsLoading ? (
								[1, 2, 3, 4, 5, 6].map((i) => (
									<Skeleton key={i} className="h-36 rounded-lg" />
								))
							) : slotsData && slotsData.length > 0 ? (
								slotsData.map((slot) => (
									<SlotCard
										key={slot.id}
										slot={slot}
										role={user?.role ?? "student"}
										onBook={(slotId) => bookMutation.mutate(slotId)}
										onPublish={
											isTa ? (id) => publishSlotMutation.mutate(id) : undefined
										}
										onVenueChange={
											isTa
												? (id, venue) =>
														venueChangeMutation.mutate({ slotId: id, venue })
												: undefined
										}
										isBooking={bookMutation.isPending}
									/>
								))
							) : (
								<Card className="col-span-full">
									<CardContent className="py-8 text-center text-muted-foreground">
										{isTa
											? "No slots yet. Generate some to get started."
											: "No available slots for this assignment."}
									</CardContent>
								</Card>
							)}
						</div>
					)}
				</Tabs>
			</main>
		</div>
	);
}

function SlotCard({
	slot,
	role,
	onBook,
	onPublish,
	onVenueChange,
	isBooking,
}: {
	slot: DemoSlot;
	role: string;
	onBook: (slotId: string) => void;
	onPublish?: (slotId: string) => void;
	onVenueChange?: (slotId: string, venue: string) => void;
	isBooking: boolean;
}) {
	const [editingVenue, setEditingVenue] = useState(false);
	const [venue, setVenue] = useState(slot.venue ?? "");
	const isFull = (slot.bookedCount ?? 0) >= slot.capacity;
	const isPublished = slot.status === "published";

	return (
		<Card className={slot.status === "draft" ? "opacity-60" : ""}>
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base">
							{format(new Date(slot.startsAt), "MMM d, yyyy")}
						</CardTitle>
						<CardDescription className="flex items-center gap-1">
							<Clock className="h-3 w-3" />
							{format(new Date(slot.startsAt), "HH:mm")} -{" "}
							{format(new Date(slot.endsAt), "HH:mm")}
						</CardDescription>
					</div>
					<Badge variant={isPublished ? "default" : "secondary"}>
						{slot.status}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-2">
				<div className="flex items-center gap-1 text-sm text-muted-foreground">
					<MapPin className="h-3 w-3" />
					{editingVenue && onVenueChange ? (
						<div className="flex gap-1">
							<Input
								value={venue}
								onChange={(e) => setVenue(e.target.value)}
								className="h-7 text-xs"
							/>
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									onVenueChange(slot.id, venue);
									setEditingVenue(false);
								}}
							>
								Save
							</Button>
						</div>
					) : (
						<button
							type="button"
							className={
								onVenueChange
									? "cursor-pointer text-left underline-offset-2 hover:underline"
									: ""
							}
							onClick={() => onVenueChange && setEditingVenue(true)}
						>
							{slot.venue || "No venue set"}
						</button>
					)}
				</div>
				{slot.ta && (
					<div className="flex items-center gap-1 text-sm text-muted-foreground">
						<User className="h-3 w-3" />
						{slot.ta.name}
					</div>
				)}
				<div className="flex items-center gap-1 text-sm text-muted-foreground">
					<Calendar className="h-3 w-3" />
					{slot.bookedCount ?? 0} / {slot.capacity} booked
				</div>
				<div className="flex gap-2 pt-1">
					{role === "student" && isPublished && !isFull && (
						<Button
							size="sm"
							className="w-full"
							onClick={() => onBook(slot.id)}
							disabled={isBooking}
						>
							{isBooking ? "Booking..." : "Book"}
						</Button>
					)}
					{role === "student" && isFull && (
						<Button size="sm" className="w-full" variant="secondary" disabled>
							Full
						</Button>
					)}
					{onPublish && slot.status === "draft" && (
						<Button
							size="sm"
							variant="outline"
							className="w-full"
							onClick={() => onPublish(slot.id)}
						>
							Publish
						</Button>
					)}
					{onPublish && slot.status === "published" && (
						<Button
							size="sm"
							variant="outline"
							className="w-full"
							onClick={() => {
								const a = document.createElement("a");
								a.href = `/course-slots/${slot.id}/bookings`;
							}}
						>
							View Bookings
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function CreateAssignmentForm({
	courseId,
	onSuccess,
}: {
	courseId: string;
	onSuccess: () => void;
}) {
	const [title, setTitle] = useState("");
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [duration, setDuration] = useState("20");
	const [capacity, setCapacity] = useState("1");
	const [venue, setVenue] = useState("");

	const mutation = useMutation({
		mutationFn: async () => {
			await assignmentsApi.create(courseId, {
				title,
				demo_window_start: new Date(start).toISOString(),
				demo_window_end: new Date(end).toISOString(),
				slot_duration_min: Number(duration),
				slot_capacity: Number(capacity),
				default_venue: venue || undefined,
			});
		},
		onSuccess: () => {
			toast.success("Assignment created");
			onSuccess();
		},
		onError: () => toast.error("Failed to create assignment"),
	});

	return (
		<div className="space-y-4">
			<div>
				<Label>Title</Label>
				<Input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="Project Demo"
				/>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div>
					<Label>Start</Label>
					<Input
						type="datetime-local"
						value={start}
						onChange={(e) => setStart(e.target.value)}
					/>
				</div>
				<div>
					<Label>End</Label>
					<Input
						type="datetime-local"
						value={end}
						onChange={(e) => setEnd(e.target.value)}
					/>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div>
					<Label>Duration (min)</Label>
					<Input
						type="number"
						value={duration}
						onChange={(e) => setDuration(e.target.value)}
					/>
				</div>
				<div>
					<Label>Capacity</Label>
					<Input
						type="number"
						value={capacity}
						onChange={(e) => setCapacity(e.target.value)}
					/>
				</div>
			</div>
			<div>
				<Label>Venue (optional)</Label>
				<Input
					value={venue}
					onChange={(e) => setVenue(e.target.value)}
					placeholder="Lab 301"
				/>
			</div>
			<Button
				onClick={() => mutation.mutate()}
				disabled={mutation.isPending}
				className="w-full"
			>
				{mutation.isPending ? "Creating..." : "Create Assignment"}
			</Button>
		</div>
	);
}
