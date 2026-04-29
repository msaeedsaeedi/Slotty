import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCoreTables20260429090000 implements MigrationInterface {
	name = "CreateCoreTables20260429090000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

		await queryRunner.query(`
			CREATE TABLE users (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				name varchar(255) NOT NULL,
				email varchar(320) NOT NULL UNIQUE,
				roll_number varchar(50),
				role varchar(20) NOT NULL CHECK (role IN ('student', 'ta', 'instructor', 'admin')),
				status varchar(20) NOT NULL DEFAULT 'active'
					CHECK (status IN ('active', 'pending_verification', 'disabled')),
				google_id varchar(128) UNIQUE,
				created_at timestamptz NOT NULL DEFAULT NOW(),
				updated_at timestamptz NOT NULL DEFAULT NOW(),
				deleted_at timestamptz
			);
		`);
		await queryRunner.query(
			"CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;",
		);
		await queryRunner.query(
			"CREATE INDEX idx_users_role ON users (role) WHERE deleted_at IS NULL;",
		);

		await queryRunner.query(`
			CREATE TABLE courses (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				code varchar(20) NOT NULL,
				title varchar(255) NOT NULL,
				owner_id uuid NOT NULL REFERENCES users(id),
				term varchar(50) NOT NULL,
				created_at timestamptz NOT NULL DEFAULT NOW(),
				updated_at timestamptz NOT NULL DEFAULT NOW(),
				deleted_at timestamptz,
				UNIQUE (code, term)
			);
		`);
		await queryRunner.query(
			"CREATE INDEX idx_courses_owner ON courses (owner_id);",
		);

		await queryRunner.query(`
			CREATE TABLE enrollments (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
				user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				role_in_course varchar(10) NOT NULL CHECK (role_in_course IN ('student', 'ta')),
				created_at timestamptz NOT NULL DEFAULT NOW(),
				UNIQUE (course_id, user_id)
			);
		`);
		await queryRunner.query(
			"CREATE INDEX idx_enrollments_course ON enrollments (course_id);",
		);
		await queryRunner.query(
			"CREATE INDEX idx_enrollments_user ON enrollments (user_id);",
		);

		await queryRunner.query(`
			CREATE TABLE assignments (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
				title varchar(255) NOT NULL,
				demo_window_start timestamptz NOT NULL,
				demo_window_end timestamptz NOT NULL,
				slot_duration_min smallint NOT NULL CHECK (slot_duration_min > 0),
				capacity smallint NOT NULL DEFAULT 1 CHECK (capacity > 0),
				freeze_before_min integer NOT NULL DEFAULT 60,
				max_cancellations smallint NOT NULL DEFAULT 1,
				default_venue varchar(512),
				is_published boolean NOT NULL DEFAULT false,
				created_at timestamptz NOT NULL DEFAULT NOW(),
				updated_at timestamptz NOT NULL DEFAULT NOW(),
				CONSTRAINT chk_window CHECK (demo_window_end > demo_window_start)
			);
		`);
		await queryRunner.query(
			"CREATE INDEX idx_assignments_course ON assignments (course_id);",
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query("DROP TABLE IF EXISTS assignments;");
		await queryRunner.query("DROP TABLE IF EXISTS enrollments;");
		await queryRunner.query("DROP TABLE IF EXISTS courses;");
		await queryRunner.query("DROP TABLE IF EXISTS users;");
	}
}
