"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthCallbackPage() {
	const router = useRouter();

	useEffect(() => {
		const timer = setTimeout(() => {
			router.replace("/dashboard");
		}, 1000);
		return () => clearTimeout(timer);
	}, [router]);

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="text-center">
				<div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
				<p className="text-lg font-medium">Signing you in...</p>
				<p className="text-sm text-muted-foreground">Verifying your account</p>
			</div>
		</div>
	);
}
