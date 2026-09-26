-- Runs once, when the Postgres volume is first created.
-- slotty (dev) is created from POSTGRES_DB; tests and the local production image get their own.
CREATE DATABASE slotty_test;
CREATE DATABASE slotty_app;
