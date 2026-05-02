import { Test, TestingModule } from "@nestjs/testing";
import { BookingStatus, UserRole } from "@prisma/client";
import { PrismaService } from "prisma/prisma.service";
import {
	ConflictException,
	ForbiddenException,
	InternalServerErrorException,
	NotFoundException,
	UnprocessableEntityException,
} from "@/common/exceptions/business.exception";
import { AuditService } from "@/modules/audit/audit.service";
import { attempt } from "@/utils/attempt.util";
import { CreateEvaluationDto } from "./dto/create-evaluation.dto";
import { UpdateEvaluationDto } from "./dto/update-evaluation.dto";
import { EvaluationsService } from "./evaluations.service";

jest.mock("@/utils/attempt.util");

describe("EvaluationsService", () => {
	let service: EvaluationsService;
	let mockPrisma: any;
	let mockAuditService: jest.Mocked<AuditService>;

	const mockEvaluation = {
		id: "eval-id",
		bookingId: "booking-id",
		taId: "ta-id",
		rubricScores: {},
		totalScore: null,
		privateNote: null,
		submittedAt: null,
		visibleToInstructor: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		booking: {
			id: "booking-id",
			status: BookingStatus.completed,
			slot: { taId: "ta-id" },
			student: {
				id: "student-id",
				name: "Student",
				email: "s@test.com",
				rollNumber: null,
			},
			slot: {
				id: "slot-id",
				startsAt: new Date(),
				endsAt: new Date(),
				venue: "Room 1",
			},
			assignment: { id: "assignment-id", title: "Test", courseId: "course-id" },
		},
		ta: { id: "ta-id", name: "TA", email: "ta@test.com" },
	};

	beforeEach(async () => {
		mockPrisma = {
			booking: {
				findUnique: jest.fn(),
			},
			evaluation: {
				create: jest.fn(),
				findUnique: jest.fn(),
				findMany: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn(),
			},
			assignment: {
				findUnique: jest.fn(),
			},
			auditEvent: {
				create: jest.fn(),
			},
			$transaction: jest.fn((callbacks) => {
				if (Array.isArray(callbacks)) {
					return Promise.all(callbacks);
				}
				return callbacks;
			}),
		};

		mockAuditService = {
			append: jest.fn().mockResolvedValue(undefined),
		} as any;

		(attempt as jest.Mock).mockImplementation((promise) =>
			promise.then(
				(data: any) => [null, data],
				(err: any) => [err, null],
			),
		);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				EvaluationsService,
				{ provide: PrismaService, useValue: mockPrisma },
				{ provide: AuditService, useValue: mockAuditService },
			],
		}).compile();

		service = module.get<EvaluationsService>(EvaluationsService);

		jest.clearAllMocks();
	});

	describe("create", () => {
		const dto: CreateEvaluationDto = {
			bookingId: "booking-id",
			rubricScores: { q1: 5 },
			totalScore: 5,
			privateNote: "Good job",
		};

		it("should throw InternalServerErrorException when booking fetch fails", async () => {
			(attempt as jest.Mock).mockResolvedValueOnce([
				new Error("DB error"),
				null,
			]);

			await expect(service.create("ta-id", dto)).rejects.toThrow(
				InternalServerErrorException,
			);
		});

		it("should throw NotFoundException when booking not found", async () => {
			(attempt as jest.Mock).mockResolvedValueOnce([null, null]);

			await expect(service.create("ta-id", dto)).rejects.toThrow(
				NotFoundException,
			);
		});

		it("should throw ForbiddenException when TA does not own slot", async () => {
			const booking = {
				id: "booking-id",
				slot: { taId: "other-ta-id" },
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, booking]);

			await expect(service.create("ta-id", dto)).rejects.toThrow(
				ForbiddenException,
			);
		});

		it("should throw UnprocessableEntityException when booking not completed", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.booked,
				slot: { taId: "ta-id" },
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, booking]);

			await expect(service.create("ta-id", dto)).rejects.toThrow(
				UnprocessableEntityException,
			);
		});

		it("should throw InternalServerErrorException when evaluation already exists", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.completed,
				slot: { taId: "ta-id" },
			};
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, booking])
				.mockResolvedValueOnce([{ code: "P2002" }, null]);

			await expect(service.create("ta-id", dto)).rejects.toThrow(
				InternalServerErrorException,
			);
		});

		it("should create evaluation successfully", async () => {
			const booking = {
				id: "booking-id",
				status: BookingStatus.completed,
				slot: { taId: "ta-id" },
			};
			const evaluation = { ...mockEvaluation };
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, booking])
				.mockResolvedValueOnce([null, evaluation]);

			const result = await service.create("ta-id", dto);

			expect(result).toEqual(evaluation);
			expect(mockAuditService.append).toHaveBeenCalledWith(
				expect.objectContaining({ eventType: "created" }),
			);
		});
	});

	describe("findOne", () => {
		it("should throw InternalServerErrorException on fetch error", async () => {
			(attempt as jest.Mock).mockResolvedValueOnce([
				new Error("DB error"),
				null,
			]);

			await expect(
				service.findOne("user-id", UserRole.ta, "eval-id"),
			).rejects.toThrow(InternalServerErrorException);
		});

		it("should throw NotFoundException when evaluation not found", async () => {
			(attempt as jest.Mock).mockResolvedValueOnce([null, null]);

			await expect(
				service.findOne("user-id", UserRole.ta, "eval-id"),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ForbiddenException when TA does not own evaluation", async () => {
			const evaluation = { ...mockEvaluation, taId: "other-ta-id" };
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluation]);

			await expect(
				service.findOne("ta-id", UserRole.ta, "eval-id"),
			).rejects.toThrow(ForbiddenException);
		});

		it("should return evaluation with privateNote for TA", async () => {
			const evaluation = {
				...mockEvaluation,
				taId: "ta-id",
				privateNote: "Note",
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluation]);

			const result = await service.findOne("ta-id", UserRole.ta, "eval-id");

			expect(result.privateNote).toBe("Note");
		});

		it("should strip privateNote for instructor when not submitted", async () => {
			const evaluation = {
				...mockEvaluation,
				taId: "ta-id",
				privateNote: "Secret",
				visibleToInstructor: false,
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluation]);

			await expect(
				service.findOne("instructor-id", UserRole.instructor, "eval-id"),
			).rejects.toThrow(ForbiddenException);
		});

		it("should return evaluation for instructor when submitted", async () => {
			const evaluation = {
				...mockEvaluation,
				taId: "ta-id",
				privateNote: "Secret",
				visibleToInstructor: true,
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluation]);

			const result = await service.findOne(
				"instructor-id",
				UserRole.instructor,
				"eval-id",
			);

			expect(result.privateNote).toBeNull();
		});
	});

	describe("update", () => {
		const dto: UpdateEvaluationDto = {
			rubricScores: { q1: 10 },
			totalScore: 10,
		};

		it("should throw NotFoundException when evaluation not found", async () => {
			(attempt as jest.Mock).mockResolvedValueOnce([null, null]);

			await expect(
				service.update("user-id", UserRole.ta, "eval-id", dto),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ForbiddenException when user does not own evaluation", async () => {
			const evaluation = { ...mockEvaluation, taId: "other-ta-id" };
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluation]);

			await expect(
				service.update("ta-id", UserRole.ta, "eval-id", dto),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw ForbiddenException when evaluation already submitted for non-admin", async () => {
			const evaluation = {
				...mockEvaluation,
				taId: "ta-id",
				submittedAt: new Date(),
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluation]);

			await expect(
				service.update("ta-id", UserRole.ta, "eval-id", dto),
			).rejects.toThrow(ForbiddenException);
		});

		it("should allow admin to update submitted evaluation", async () => {
			const evaluation = {
				...mockEvaluation,
				taId: "ta-id",
				submittedAt: new Date(),
			};
			const updated = { ...evaluation };
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, evaluation])
				.mockResolvedValueOnce([null, updated]);

			const result = await service.update(
				"admin-id",
				UserRole.admin,
				"eval-id",
				dto,
			);

			expect(result).toEqual(updated);
		});

		it("should update evaluation successfully", async () => {
			const evaluation = { ...mockEvaluation, taId: "ta-id" };
			const updated = { ...evaluation, totalScore: 10 };
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, evaluation])
				.mockResolvedValueOnce([null, updated]);

			const result = await service.update("ta-id", UserRole.ta, "eval-id", dto);

			expect(result.totalScore).toBe(10);
			expect(mockAuditService.append).toHaveBeenCalled();
		});
	});

	describe("submitBatch", () => {
		it("should throw NotFoundException when assignment not found", async () => {
			(attempt as jest.Mock).mockResolvedValueOnce([null, null]);

			await expect(
				service.submitBatch("user-id", UserRole.ta, "assignment-id"),
			).rejects.toThrow(NotFoundException);
		});

		it("should throw ForbiddenException when TA not assigned to assignment", async () => {
			const assignment = { demoSlots: [] };
			(attempt as jest.Mock).mockResolvedValueOnce([null, assignment]);

			await expect(
				service.submitBatch("ta-id", UserRole.ta, "assignment-id"),
			).rejects.toThrow(ForbiddenException);
		});

		it("should throw UnprocessableEntityException when no completed bookings", async () => {
			const assignment = {
				demoSlots: [{ bookings: [] }],
			};
			(attempt as jest.Mock).mockResolvedValueOnce([null, assignment]);

			await expect(
				service.submitBatch("ta-id", UserRole.ta, "assignment-id"),
			).rejects.toThrow(UnprocessableEntityException);
		});

		it("should throw UnprocessableEntityException when evaluations missing", async () => {
			const assignment = {
				demoSlots: [{ bookings: [{ id: "booking-1" }, { id: "booking-2" }] }],
			};
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, assignment])
				.mockResolvedValueOnce([null, []]);

			await expect(
				service.submitBatch("ta-id", UserRole.ta, "assignment-id"),
			).rejects.toThrow(UnprocessableEntityException);
		});

		it("should throw ConflictException when already submitted", async () => {
			const assignment = {
				demoSlots: [{ bookings: [{ id: "booking-1" }] }],
			};
			const evaluations = [
				{ id: "eval-1", bookingId: "booking-1", submittedAt: new Date() },
			];
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, assignment])
				.mockResolvedValueOnce([null, evaluations]);

			await expect(
				service.submitBatch("ta-id", UserRole.ta, "assignment-id"),
			).rejects.toThrow(ConflictException);
		});

		it("should submit batch successfully", async () => {
			const assignment = {
				demoSlots: [{ bookings: [{ id: "booking-1" }] }],
			};
			const evaluations = [
				{ id: "eval-1", bookingId: "booking-1", submittedAt: null },
			];
			(attempt as jest.Mock)
				.mockResolvedValueOnce([null, assignment])
				.mockResolvedValueOnce([null, evaluations]);

			mockPrisma.$transaction.mockResolvedValueOnce([null, null]);

			const result = await service.submitBatch(
				"ta-id",
				UserRole.ta,
				"assignment-id",
			);

			expect(result.submitted).toBe(1);
			expect(result.submittedAt).toBeInstanceOf(Date);
		});
	});

	describe("findByCourse", () => {
		it("should return evaluations for course", async () => {
			const evaluations = [mockEvaluation];
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluations]);

			const result = await service.findByCourse("course-id", {});

			expect(result).toHaveLength(1);
			expect(result[0].privateNote).toBeNull();
		});

		it("should filter by assignmentId when provided", async () => {
			const evaluations = [mockEvaluation];
			(attempt as jest.Mock).mockResolvedValueOnce([null, evaluations]);

			await service.findByCourse("course-id", {
				assignmentId: "assignment-id",
			});

			expect(mockPrisma.evaluation.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ booking: expect.any(Object) }),
				}),
			);
		});
	});
});
