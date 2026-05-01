import {
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	InternalServerErrorException,
	Post,
	Req,
	Res,
	UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import { Profile } from "passport-google-oauth20";
import { attempt } from "@/common/try-catch.helper";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";

@Controller({
	path: "auth",
	version: "1",
})
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Public()
	@Get("google")
	@UseGuards(AuthGuard("google"))
	async googleLogin() {
		return;
	}

	@Public()
	@Get("google/callback")
	@UseGuards(AuthGuard("google"))
	async googleCallback(@Req() req: Request, @Res() res: Response) {
		const profile = req.user as Profile;
		const [error] = await attempt(this.authService.handleGoogleLogin(profile));

		if (error) {
			throw new ForbiddenException("Google authentication failed");
		}

		return res.redirect(this.authService.getWebAppUrl());
	}

	@Post("logout")
	@HttpCode(204)
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
	async me(@Req() req: Request) {
		const session = req.session as { userId?: string };
		const userId = session.userId;
		const user = await this.authService.getSessionUser(userId);
		return { user };
	}
}
