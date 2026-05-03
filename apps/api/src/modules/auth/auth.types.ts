import { User } from "@repo/database";

export interface RequestWithUser extends Request {
	user: User;
}
