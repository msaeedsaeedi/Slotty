import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Course } from "../../database/entities/course.entity.js";
import { Enrollment } from "../../database/entities/enrollment.entity.js";
import { User } from "../../database/entities/user.entity.js";
import { UsersModule } from "../users/users.module.js";
import { CoursesController } from "./courses.controller.js";
import { CoursesService } from "./courses.service.js";

@Module({
	imports: [TypeOrmModule.forFeature([Course, Enrollment, User]), UsersModule],
	controllers: [CoursesController],
	providers: [CoursesService],
})
export class CoursesModule {}
