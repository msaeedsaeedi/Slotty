import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity.js";

@Entity({ name: "courses" })
@Unique(["code", "term"])
export class Course {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column({ type: "varchar", length: 20 })
	code!: string;

	@Column({ type: "varchar", length: 255 })
	title!: string;

	@Column({ type: "uuid", name: "owner_id" })
	ownerId!: string;

	@ManyToOne(() => User, { nullable: false })
	@JoinColumn({ name: "owner_id" })
	owner!: User;

	@Column({ type: "varchar", length: 50 })
	term!: string;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
	updatedAt!: Date;

	@DeleteDateColumn({ type: "timestamptz", name: "deleted_at", nullable: true })
	deletedAt?: Date | null;
}
