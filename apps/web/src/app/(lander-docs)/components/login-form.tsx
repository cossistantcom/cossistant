"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAbsoluteAuthCallbackUrl } from "@/lib/auth/callback-url";
import { signIn } from "@/lib/auth/client";
import {
	buildInviteAuthPath,
	buildInviteAwarePath,
	readInviteAuthState,
} from "@/lib/auth/invite-state";
import { getLoginRedirectReasonMessage } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";

export const GoogleIcon = ({ className }: { className?: string }) => (
	<svg
		className={cn("size-4", className)}
		clipRule="evenodd"
		fill="currentColor"
		fillRule="evenodd"
		strokeLinejoin="round"
		strokeMiterlimit="2"
		viewBox="0 0 512 512"
		xmlns="http://www.w3.org/2000/svg"
	>
		<title>Google</title>
		<path d="M32.582 370.734C15.127 336.291 5.12 297.425 5.12 256c0-41.426 10.007-80.291 27.462-114.735C74.705 57.484 161.047 0 261.12 0c69.12 0 126.836 25.367 171.287 66.793l-73.31 73.309c-26.763-25.135-60.276-38.168-97.977-38.168-66.56 0-123.113 44.917-143.36 105.426-5.12 15.36-8.146 31.65-8.146 48.64 0 16.989 3.026 33.28 8.146 48.64l-.303.232h.303c20.247 60.51 76.8 105.426 143.36 105.426 34.443 0 63.534-9.31 86.341-24.67 27.23-18.152 45.382-45.148 51.433-77.032H261.12v-99.142h241.105c3.025 16.757 4.654 34.211 4.654 52.364 0 77.963-27.927 143.592-76.334 188.276-42.356 39.098-100.305 61.905-169.425 61.905-100.073 0-186.415-57.483-228.538-141.032v-.233z" />
	</svg>
);

export function DiscordIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("size-4", className)}
			preserveAspectRatio="xMidYMid"
			viewBox="0 -28.5 256 256"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Discord</title>
			<path
				d="M216.856339 16.5966031C200.285002 8.84328665 182.566144 3.2084988 164.041564 0c-2.275041 4.11318106-4.93294 9.64549908-6.765465 14.0464379-19.692104-2.9614483-39.203132-2.9614483-58.5330827 0C96.9108417 9.64549908 94.1925838 4.11318106 91.8971895 0 73.3526068 3.2084988 55.6133949 8.86399117 39.0420583 16.6376612 5.61752293 67.146514-3.4433191 116.400813 1.08711069 164.955721c22.16890891 16.555194 43.65325271 26.611976 64.77502181 33.192855 5.2150826-7.17745 9.8662303-14.807241 13.8730814-22.848315-7.6311949-2.899686-14.9402415-6.478059-21.8464273-10.632298 1.8321746-1.357374 3.6243438-2.776511 5.3558032-4.236706 42.1228202 19.70193 87.8903382 19.70193 129.5099332 0 1.751813 1.460195 3.543631 2.879332 5.355803 4.236706-6.926539 4.174593-14.255589 7.752966-21.886784 10.653002 4.006851 8.02037 8.637996 15.670866 13.873082 22.847965 21.142122-6.580879 42.646399-16.637311 64.815325-33.213209 5.315798-56.28752-9.080862-105.0894778-38.05561-148.3591179ZM85.4738752 135.09489c-12.6448471 0-23.0146535-11.804735-23.0146535-26.179989 0-14.3752538 10.1483733-26.2003423 23.0146535-26.2003423 12.8666312 0 23.2360868 11.804384 23.0146538 26.2003423.020002 14.375254-10.1480226 26.179989-23.0146538 26.179989Zm85.0513618 0c-12.644847 0-23.014653-11.804735-23.014653-26.179989 0-14.3752538 10.148022-26.2003423 23.014653-26.2003423 12.866281 0 23.236087 11.804384 23.014654 26.2003423 0 14.375254-10.148373 26.179989-23.014654 26.179989Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export const GithubIcon = ({ className }: { className?: string }) => (
	<svg
		className={cn("size-4", className)}
		fill="none"
		height="24"
		viewBox="0 0 98 96"
		width="24"
		xmlns="http://www.w3.org/2000/svg"
	>
		<title>Github</title>
		<path
			clipRule="evenodd"
			d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
			fill="currentColor"
			fillRule="evenodd"
		/>
	</svg>
);

export function LoginForm() {
	const searchParams = useSearchParams();
	const inviteState = readInviteAuthState(searchParams, "/select");
	const inviteEmail = inviteState.inviteEmail;
	const inviteTarget = inviteState.inviteTarget;
	const isInviteFlow = inviteState.isInviteFlow;
	const isInviteEmailLocked = Boolean(isInviteFlow && inviteEmail);
	const [displaySignInPassword, setDisplaySignInPassword] = useState(false);
	const [email, setEmail] = useState(inviteEmail ?? "");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const authNotice = getLoginRedirectReasonMessage(searchParams.get("reason"));

	const callbackPath = inviteState.callbackPath;
	const callbackURL = getAbsoluteAuthCallbackUrl(callbackPath);
	const signUpHref = isInviteFlow
		? buildInviteAuthPath("/sign-up", {
				callbackPath,
				inviteEmail,
				inviteTarget,
			})
		: "/sign-up";
	const forgotPasswordHref = isInviteFlow
		? buildInviteAwarePath("/forgot-password", {
				callbackPath,
				inviteEmail,
				inviteTarget,
			})
		: "/forgot-password";

	useEffect(() => {
		if (isInviteFlow) {
			setEmail(inviteEmail ?? "");
		}
	}, [inviteEmail, isInviteFlow]);

	useEffect(() => {
		const reset = searchParams.get("reset");
		if (reset === "success") {
			setSuccessMessage(
				"Password reset successful! You can now sign in with your new password."
			);
		}
	}, [searchParams]);

	const handleEmailSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!(email.trim() && password.trim())) {
			setError("Please enter both email and password");
			return;
		}

		setIsLoading(true);
		try {
			const result = await signIn.email({
				email: email.trim(),
				password,
				callbackURL,
			});

			if (result.error) {
				setError("Invalid email or password");
			}
		} catch (_error) {
			console.error("Email sign-in error:", _error);
			setError("An error occurred during sign-in. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleSignIn = async (provider: "google" | "github") => {
		await signIn.social(
			{
				provider,
				callbackURL,
			},
			{
				credentials: "include",
			}
		);
	};

	return (
		<div className="flex w-md flex-col items-center justify-between gap-6">
			{/* Email Sign-in Form - Primary Option */}
			<h1 className="font-f37-stout text-5xl">Log in</h1>
			{isInviteFlow && inviteTarget ? (
				<p className="text-center text-primary/60 text-sm">
					Sign in to join {inviteTarget}.
				</p>
			) : null}
			{authNotice ? (
				<p className="text-center text-destructive text-sm">{authNotice}</p>
			) : null}
			{displaySignInPassword ? (
				<div className="flex w-full max-w-md flex-col items-center justify-center space-y-4">
					<form
						className="mt-10 flex w-full flex-col items-center gap-2"
						onSubmit={handleEmailSignIn}
					>
						<p className="text-md text-primary/60">
							Enter your email and password to sign in
						</p>
						<Input
							disabled={isLoading}
							onChange={(e) => setEmail(e.target.value)}
							placeholder={isInviteEmailLocked ? "Invited email" : "Email"}
							readOnly={isInviteEmailLocked}
							required
							type="email"
							value={email}
							variant="lg"
						/>
						<Input
							disabled={isLoading}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Password"
							required
							type="password"
							value={password}
							variant="lg"
						/>
						{successMessage && (
							<p className="text-green-600 text-sm">{successMessage}</p>
						)}
						{error && <p className="text-destructive text-sm">{error}</p>}
						<div className="flex w-full flex-col gap-2">
							<BaseSubmitButton
								className="mt-10 w-full"
								disabled={isLoading || !email.trim() || !password.trim()}
								isSubmitting={isLoading}
								size="lg"
							>
								Sign In
							</BaseSubmitButton>
							<Button
								className="w-full"
								onClick={() => setDisplaySignInPassword(false)}
								size="lg"
								variant="outline"
							>
								Back
							</Button>
						</div>
					</form>

					<div className="flex flex-col text-center">
						<Link
							className="text-primary/60 text-sm underline"
							href={forgotPasswordHref}
						>
							Forgot your password?
						</Link>
						<p className="mt-2 text-primary/60 text-sm">
							Don&apos;t have an account?{" "}
							<Link className="underline" href={signUpHref}>
								Sign up
							</Link>
						</p>
					</div>
				</div>
			) : (
				<div className="flex w-full max-w-md flex-col items-center justify-center space-y-2">
					<div className="mt-10 flex w-full max-w-md flex-col gap-2">
						<Button
							className="w-full"
							onClick={() => handleSignIn("google")}
							size="lg"
							variant="outline"
						>
							<GoogleIcon className="size-4" />
							Continue with Google
						</Button>
						<Button
							className="w-full"
							onClick={() => handleSignIn("github")}
							size="lg"
							variant="outline"
						>
							<GithubIcon className="size-4" />
							Continue with GitHub
						</Button>
					</div>

					<Button
						className="text-primary/60 text-sm underline"
						onClick={() => setDisplaySignInPassword(true)}
						size="sm"
						variant="ghost"
					>
						Use password instead
					</Button>
					<p className="text-primary/60 text-sm">
						Don&apos;t have an account?{" "}
						<Link className="underline" href={signUpHref}>
							Sign up
						</Link>
					</p>
				</div>
			)}
		</div>
	);
}
