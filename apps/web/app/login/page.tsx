"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/hooks/use-auth";

export default function LoginPage() {
	const { login, isLoading } = useAuth();
	const [loading, setLoading] = useState(false);

	const handleLogin = () => {
		setLoading(true);
		login();
	};

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<GraduationCap className="mx-auto mb-2 h-12 w-12" />
					<CardTitle className="text-2xl">Welcome to Slotty</CardTitle>
					<CardDescription>
						Student-first scheduling and evaluation platform
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-center text-sm text-muted-foreground">
						Sign in with your university Google account to get started.
					</p>
					<Button
						className="w-full"
						onClick={handleLogin}
						disabled={loading || isLoading}
						size="lg"
					>
						{loading ? "Redirecting..." : "Sign in with Google"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
