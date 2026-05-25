"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle, ClipboardList } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { evaluationsApi } from "@/lib/api/evaluations";
import { slotsApi } from "@/lib/api/slots";
import { useAuth } from "@/lib/hooks/use-auth";
import type { Booking } from "@/lib/types";

export default function EvaluationsPage() {
	const { assignmentId } = useParams<{ assignmentId: string }>();
	const { user, isLoading: authLoading } = useAuth();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [evalBooking, setEvalBooking] = useState<Booking | null>(null);

	useEffect(() => {
		if (!authLoading && !user) router.replace("/login");
	}, [authLoading, user, router]);

	const { data: slots } = useQuery({
		queryKey: ["slots", assignmentId],
		queryFn: async () => {
			const res = await slotsApi.list(assignmentId);
			return res.data.slots;
		},
		enabled: !!user && !!assignmentId,
	});

	const { data: allBookings, isLoading } = useQuery({
		queryKey: ["all-slot-bookings", assignmentId],
		queryFn: async () => {
			if (!slots) return [];
			const results: Booking[] = [];
			for (const slot of slots) {
				try {
					const res = await slotsApi.getBookings(slot.id);
					results.push(...res.data.bookings);
				} catch {
					// Slot may have no bookings
				}
			}
			return results;
		},
		enabled: !!slots && slots.length > 0,
	});

	const submitMutation = useMutation({
		mutationFn: () => evaluationsApi.submitBatch(assignmentId),
		onSuccess: (res) => {
			toast.success(`${res.data.submitted} evaluations submitted`);
			queryClient.invalidateQueries();
		},
		onError: () => toast.error("Failed to submit evaluations"),
	});

	const bookings = allBookings ?? [];
	const completedBookings = bookings.filter((b) => b.status === "completed");
	const hasEvaluations = completedBookings.some((b) => b.evaluation);
	const allEvaluated =
		completedBookings.length > 0 &&
		completedBookings.every((b) => b.evaluation);

	if (authLoading || isLoading) {
		return (
			<div className="min-h-screen">
				<Header />
				<main className="container py-8">
					<Skeleton className="mb-4 h-8 w-64" />
					<div className="space-y-4">
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
				<div className="mb-6 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button variant="ghost" size="icon" onClick={() => router.back()}>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="text-2xl font-bold">Evaluations</h1>
							<p className="text-sm text-muted-foreground">
								Record marks for completed bookings
							</p>
						</div>
					</div>
					{hasEvaluations && (
						<Button
							variant={allEvaluated ? "default" : "outline"}
							onClick={() => {
								if (allEvaluated) {
									submitMutation.mutate();
								} else {
									toast.info("Evaluate all completed bookings first");
								}
							}}
							disabled={submitMutation.isPending}
						>
							<CheckCircle className="mr-1 h-4 w-4" />
							{submitMutation.isPending
								? "Submitting..."
								: allEvaluated
									? "Submit Batch"
									: "Submit (not ready)"}
						</Button>
					)}
				</div>

				<div className="space-y-4">
					{completedBookings.map((booking) => (
						<Card key={booking.id}>
							<CardHeader className="pb-2">
								<div className="flex items-start justify-between">
									<div>
										<CardTitle className="text-base">
											{booking.student?.name ?? "Student"}
										</CardTitle>
										<CardDescription>
											{format(
												new Date(booking.slot?.startsAt ?? ""),
												"MMM d, HH:mm",
											)}
											{booking.slot?.venue && ` — ${booking.slot.venue}`}
										</CardDescription>
									</div>
									{booking.evaluation ? (
										<div className="text-right">
											<Badge variant="default">
												Scored: {booking.evaluation.totalScore}
											</Badge>
											{booking.evaluation.visibleToInstructor && (
												<Badge variant="secondary" className="ml-1">
													Submitted
												</Badge>
											)}
										</div>
									) : (
										<Badge variant="outline">Not Evaluated</Badge>
									)}
								</div>
							</CardHeader>
							<CardContent>
								{booking.evaluation ? (
									<div className="text-sm text-muted-foreground">
										<p>
											Rubric: {JSON.stringify(booking.evaluation.rubricScores)}
										</p>
										{booking.evaluation.privateNote && (
											<p className="mt-1">
												Note: {booking.evaluation.privateNote}
											</p>
										)}
									</div>
								) : (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setEvalBooking(booking)}
									>
										<ClipboardList className="mr-1 h-4 w-4" />
										Record Evaluation
									</Button>
								)}
							</CardContent>
						</Card>
					))}
					{completedBookings.length === 0 && (
						<Card>
							<CardContent className="py-8 text-center text-muted-foreground">
								No completed bookings to evaluate yet.
							</CardContent>
						</Card>
					)}
				</div>

				<EvaluationDialog
					booking={evalBooking}
					onClose={() => setEvalBooking(null)}
					onSuccess={() => {
						setEvalBooking(null);
						queryClient.invalidateQueries({ queryKey: ["all-slot-bookings"] });
					}}
				/>
			</main>
		</div>
	);
}

function EvaluationDialog({
	booking,
	onClose,
	onSuccess,
}: {
	booking: Booking | null;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [rubricDesign, setRubricDesign] = useState("0");
	const [rubricFunc, setRubricFunc] = useState("0");
	const [rubricPres, setRubricPres] = useState("0");
	const [totalScore, setTotalScore] = useState("0");
	const [note, setNote] = useState("");

	const createMutation = useMutation({
		mutationFn: async () => {
			if (!booking) throw new Error("No booking selected");
			return evaluationsApi.create({
				booking_id: booking.id,
				rubric_scores: {
					design: Number(rubricDesign),
					functionality: Number(rubricFunc),
					presentation: Number(rubricPres),
				},
				total_score: Number(totalScore),
				private_note: note || undefined,
			});
		},
		onSuccess: () => {
			toast.success("Evaluation recorded");
			onSuccess();
		},
		onError: () => toast.error("Failed to record evaluation"),
	});

	const calculated =
		Number(rubricDesign) + Number(rubricFunc) + Number(rubricPres);

	return (
		<Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Record Evaluation</DialogTitle>
				</DialogHeader>
				{booking && (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{booking.student?.name} —{" "}
							{format(new Date(booking.slot?.startsAt ?? ""), "MMM d, HH:mm")}
						</p>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<Label>Design (0-10)</Label>
								<Input
									type="number"
									min="0"
									max="10"
									value={rubricDesign}
									onChange={(e) => setRubricDesign(e.target.value)}
								/>
							</div>
							<div>
								<Label>Functionality (0-10)</Label>
								<Input
									type="number"
									min="0"
									max="10"
									value={rubricFunc}
									onChange={(e) => setRubricFunc(e.target.value)}
								/>
							</div>
							<div>
								<Label>Presentation (0-10)</Label>
								<Input
									type="number"
									min="0"
									max="10"
									value={rubricPres}
									onChange={(e) => setRubricPres(e.target.value)}
								/>
							</div>
							<div>
								<Label>Total Score</Label>
								<div className="flex gap-2">
									<Input
										type="number"
										value={totalScore}
										onChange={(e) => setTotalScore(e.target.value)}
									/>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setTotalScore(String(calculated))}
									>
										Sum
									</Button>
								</div>
							</div>
						</div>
						<div>
							<Label>Private Note</Label>
							<Textarea
								value={note}
								onChange={(e) => setNote(e.target.value)}
								placeholder="Optional notes for your reference..."
							/>
						</div>
						<Button
							onClick={() => createMutation.mutate()}
							disabled={createMutation.isPending}
							className="w-full"
						>
							{createMutation.isPending ? "Saving..." : "Save Evaluation"}
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
