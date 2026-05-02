import { Test, TestingModule } from "@nestjs/testing";
import { User } from "@prisma/client";
import { CreateEvaluationDto } from "./dto/create-evaluation.dto";
import { UpdateEvaluationDto } from "./dto/update-evaluation.dto";
import { EvaluationsController } from "./evaluations.controller";
import { EvaluationsService } from "./evaluations.service";

jest.mock("./evaluations.service");

describe("EvaluationsController", () => {
	let controller: EvaluationsController;
	let mockEvaluationsService: any;

	const mockUser: User = {
		id: "user-id",
		email: "test@example.com",
		name: "Test User",
		role: "ta",
		status: "active",
		googleId: null,
		rollNumber: null,
		deletedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	beforeEach(async () => {
		mockEvaluationsService = {
			create: jest.fn(),
			findOne: jest.fn(),
			update: jest.fn(),
			submitBatch: jest.fn(),
			findByCourse: jest.fn(),
		};

		const module: TestingModule = await Test.createTestingModule({
			controllers: [EvaluationsController],
			providers: [
				{ provide: EvaluationsService, useValue: mockEvaluationsService },
			],
		}).compile();

		controller = module.get<EvaluationsController>(EvaluationsController);

		jest.clearAllMocks();
	});

	describe("create", () => {
		const dto: CreateEvaluationDto = {
			bookingId: "booking-id",
			rubricScores: { q1: 5 },
			totalScore: 5,
		};

		it("should create evaluation successfully", async () => {
			const evaluation = { id: "eval-id", ...dto };
			mockEvaluationsService.create.mockResolvedValue(evaluation);

			const result = await controller.create({ user: mockUser } as any, dto);

			expect(result).toEqual({ evaluation });
			expect(mockEvaluationsService.create).toHaveBeenCalledWith(
				mockUser.id,
				dto,
			);
		});
	});

	describe("findOne", () => {
		it("should return evaluation", async () => {
			const evaluation = { id: "eval-id" };
			mockEvaluationsService.findOne.mockResolvedValue(evaluation);

			const result = await controller.findOne(
				{ user: mockUser } as any,
				"eval-id",
			);

			expect(result).toEqual({ evaluation });
		});
	});

	describe("update", () => {
		const dto: UpdateEvaluationDto = { totalScore: 10 };

		it("should update evaluation successfully", async () => {
			const evaluation = { id: "eval-id", totalScore: 10 };
			mockEvaluationsService.update.mockResolvedValue(evaluation);

			const result = await controller.update(
				{ user: mockUser } as any,
				"eval-id",
				dto,
			);

			expect(result).toEqual({ evaluation });
		});
	});

	describe("submitBatch", () => {
		it("should submit batch successfully", async () => {
			const result = { submitted: 5, submittedAt: new Date() };
			mockEvaluationsService.submitBatch.mockResolvedValue(result);

			const response = await controller.submitBatch(
				{ user: mockUser } as any,
				"assignment-id",
			);

			expect(response).toEqual({ ...result });
		});
	});

	describe("findByCourse", () => {
		it("should return evaluations for course", async () => {
			const evaluations = [{ id: "eval-1" }, { id: "eval-2" }];
			mockEvaluationsService.findByCourse.mockResolvedValue(evaluations);

			const response = await controller.findByCourse("course-id", {}, {
				user: mockUser,
			} as any);

			expect(response).toEqual({ evaluations });
		});
	});
});
