import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from "typeorm";

export type UserRole = "student" | "ta" | "instructor" | "admin";
export type UserStatus = "active" | "pending_verification" | "disabled";

@Entity({ name: "users" })
export class User {
	@PrimaryGeneratedColumn("uuid")
	id!: string;

	@Column({ type: "varchar", length: 255 })
	name!: string;

	@Column({ type: "varchar", length: 320, unique: true })
	email!: string;

	@Column({ type: "varchar", length: 50, name: "roll_number", nullable: true })
	rollNumber?: string | null;

	@Column({ type: "varchar", length: 20 })
	role!: UserRole;

	@Column({ type: "varchar", length: 20, default: "active" })
	status!: UserStatus;

	@Column({ type: "varchar", length: 128, name: "google_id", unique: true, nullable: true })
	googleId?: string | null;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;

	@UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
	updatedAt!: Date;

	@DeleteDateColumn({ type: "timestamptz", name: "deleted_at", nullable: true })
	deletedAt?: Date | null;
}
