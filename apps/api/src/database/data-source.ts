import "reflect-metadata";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./database.config.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to initialize the data source.");
}

const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
export default dataSource;
