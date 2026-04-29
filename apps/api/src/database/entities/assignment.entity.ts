import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";
import { Course } from "./course.entity.js";

@Entity({ name: "assignments" })
export class Assignment {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column({ type: "uuid", name: "course_id" })
	courseId!: string;

	@ManyToOne(() => Course, { nullable: false })
	@JoinColumn({ name: "course_id" })
	course!: Course;

	@Column({ type: "varchar", length: 255 })
	title!: string;

	@Column({ type: "timestamptz", name: "demo_window_start" })
	demoWindowStart!: Date;

	@Column({ type: "timestamptz", name: "demo_window_end" })
	demoWindowEnd!: Date;

	@Column({ type: "smallint", name: "slot_duration_min" })
	slotDurationMin!: number;

	@Column({ type: "smallint", default: 1 })
	capacity!: number;

	@Column({ type: "integer", name: "freeze_before_min", default: 60 })
	freezeBeforeMin!: number;

	@Column({ type: "smallint", name: "max_cancellations", default: 1 })
	maxCancellations!: number;

	@Column({ type: "varchar", length: 512, name: "default_venue", nullable: true })
	defaultVenue?: string | null;

	@Column({ type: "boolean", name: "is_published", default: false })
	isPublished!: boolean;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
	updatedAt!: Date;
}
