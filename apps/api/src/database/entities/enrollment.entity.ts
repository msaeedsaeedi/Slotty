import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
} from "typeorm";
import { Course } from "./course.entity.js";
import { User } from "./user.entity.js";

export type CourseRole = "student" | "ta";

@Entity({ name: "enrollments" })
@Unique(["courseId", "userId"])
export class Enrollment {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column({ type: "uuid", name: "course_id" })
	courseId!: string;

	@ManyToOne(() => Course, { nullable: false })
	@JoinColumn({ name: "course_id" })
	course!: Course;

	@Column({ type: "uuid", name: "user_id" })
	userId!: string;

	@ManyToOne(() => User, { nullable: false })
	@JoinColumn({ name: "user_id" })
	user!: User;

	@Column({ type: "varchar", length: 10, name: "role_in_course" })
	roleInCourse!: CourseRole;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;
}
