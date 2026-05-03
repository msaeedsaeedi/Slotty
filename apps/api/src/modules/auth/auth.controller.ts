import {
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	Post,
	Req,
	Res,
	UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
	ApiExcludeEndpoint,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { Profile } from "passport-google-oauth20";
import { attempt } from "@/utils/attempt.util";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";

@ApiTags("Auth")
@Controller({
	path: "auth",
	version: "1",
})
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Public()
	@Get("google")
	@ApiOperation({ summary: "Initiate Google OAuth2 login" })
	@ApiResponse({
		status: 302,
		description: "Redirects to Google for authentication",
	})
	@UseGuards(AuthGuard("google"))
	async googleLogin() {
		return;
	}

	@Public()
	@Get("google/callback")
	@ApiExcludeEndpoint()
	@UseGuards(AuthGuard("google"))
	async googleCallback(@Req() req: Request, @Res() res: Response) {
		const profile = req.user as Profile;
		const [error] = await attempt(this.authService.handleGoogleLogin(profile));

		if (error) {
			throw new ForbiddenException(
				"GOOGLE_AUTH_FAILED",
				"Google authentication failed",
			);
		}

		return res.redirect(this.authService.getWebAppUrl());
	}

	@Post("logout")
	@HttpCode(204)
	@ApiOperation({ summary: "Logout and destroy session" })
	@ApiResponse({ status: 204, description: "Logged out successfully" })
	async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const sessionName = this.authService.getSessionName();

		await new Promise<void>((resolve, reject) => {
			req.session.destroy((err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		});

		res.clearCookie(sessionName);
		return;
	}

	@Get("me")
	@ApiOperation({ summary: "Get current authenticated user" })
	@ApiResponse({ status: 200, description: "Current user details" })
	@ApiResponse({ status: 401, description: "Not authenticated" })
	async me(@Req() req: Request) {
		const session = req.session as { userId?: string };
		const userId = session.userId;
		const user = await this.authService.getSessionUser(userId);
		return { user };
	}
}
