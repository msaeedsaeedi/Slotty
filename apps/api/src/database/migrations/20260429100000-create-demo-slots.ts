import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDemoSlots20260429100000 implements MigrationInterface {
	name = "CreateDemoSlots20260429100000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE demo_slots (
				id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
				assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
				ta_id uuid NOT NULL REFERENCES users(id),
				starts_at timestamptz NOT NULL,
				ends_at timestamptz NOT NULL,
				venue varchar(512),
				capacity smallint NOT NULL DEFAULT 1,
				status varchar(20) NOT NULL DEFAULT 'draft'
					CHECK (status IN ('draft', 'published', 'booked', 'completed', 'cancelled')),
				version integer NOT NULL DEFAULT 1,
				created_at timestamptz NOT NULL DEFAULT NOW(),
				updated_at timestamptz NOT NULL DEFAULT NOW(),
				CONSTRAINT chk_slot_times CHECK (ends_at > starts_at)
			);
		`);
		await queryRunner.query(
			"CREATE INDEX idx_demo_slots_assignment ON demo_slots (assignment_id);",
		);
		await queryRunner.query("CREATE INDEX idx_demo_slots_ta ON demo_slots (ta_id);");
		await queryRunner.query(
			"CREATE INDEX idx_demo_slots_status ON demo_slots (status, starts_at);",
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query("DROP TABLE IF EXISTS demo_slots;");
	}
}
