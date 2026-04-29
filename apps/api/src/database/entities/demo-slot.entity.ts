import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";
import { Assignment } from "./assignment.entity.js";
import { User } from "./user.entity.js";

export type SlotStatus = "draft" | "published" | "booked" | "completed" | "cancelled";

@Entity({ name: "demo_slots" })
export class DemoSlot {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column({ type: "uuid", name: "assignment_id" })
	assignmentId!: string;

	@ManyToOne(() => Assignment, { nullable: false })
	@JoinColumn({ name: "assignment_id" })
	assignment!: Assignment;

	@Column({ type: "uuid", name: "ta_id" })
	taId!: string;

	@ManyToOne(() => User, { nullable: false })
	@JoinColumn({ name: "ta_id" })
	ta!: User;

	@Column({ type: "timestamptz", name: "starts_at" })
	startsAt!: Date;

	@Column({ type: "timestamptz", name: "ends_at" })
	endsAt!: Date;

	@Column({ type: "varchar", length: 512, nullable: true })
	venue?: string | null;

	@Column({ type: "smallint", default: 1 })
	capacity!: number;

	@Column({ type: "varchar", length: 20, default: "draft" })
	status!: SlotStatus;

	@Column({ type: "integer", default: 1 })
	version!: number;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
	updatedAt!: Date;
}
