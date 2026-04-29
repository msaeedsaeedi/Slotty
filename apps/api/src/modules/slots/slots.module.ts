import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Assignment } from "../../database/entities/assignment.entity.js";
import { DemoSlot } from "../../database/entities/demo-slot.entity.js";
import { User } from "../../database/entities/user.entity.js";
import { SlotsController } from "./slots.controller.js";
import { SlotsService } from "./slots.service.js";

@Module({
	imports: [TypeOrmModule.forFeature([DemoSlot, Assignment, User])],
	controllers: [SlotsController],
	providers: [SlotsService],
})
export class SlotsModule {}
