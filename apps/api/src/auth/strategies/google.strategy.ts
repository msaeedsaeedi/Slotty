import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { type Profile, Strategy } from "passport-google-oauth20";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
	constructor(readonly configService: ConfigService) {
		const clientID = configService.get<string>("google.clientId");
		const clientSecret = configService.get<string>("google.clientSecret");
		const callbackURL = configService.get<string>("google.callbackURL");

		if (!clientID || !clientSecret || !callbackURL) {
			throw new Error(
				"Google OAuth configuration is missing. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL environment variables.",
			);
		}

		super({
			clientID,
			clientSecret,
			callbackURL,
			scope: ["profile", "email"],
			state: true,
		});
	}

	validate(_accessToken: string, _refreshToken: string, profile: Profile) {
		return profile;
	}
}
