import { beforeEach, describe, expect, it, mock } from "bun:test";

const addUserToDefaultAudienceMock = mock(
	(async () => true) as (...args: unknown[]) => Promise<boolean>
);

mock.module("@plasma/transactional", () => ({
	addUserToDefaultAudience: addUserToDefaultAudienceMock,
}));

const authUserAudienceModulePromise = import("./auth-user-audience");

function spyConsole() {
	const warnSpy = mock(() => {});
	const errorSpy = mock(() => {});
	const originalWarn = console.warn;
	const originalError = console.error;

	console.warn = warnSpy as unknown as typeof console.warn;
	console.error = errorSpy as unknown as typeof console.error;

	return {
		warnSpy,
		errorSpy,
		restore: () => {
			console.warn = originalWarn;
			console.error = originalError;
		},
	};
}

describe("syncUserToDefaultResendAudience", () => {
	beforeEach(() => {
		addUserToDefaultAudienceMock.mockReset();
		addUserToDefaultAudienceMock.mockResolvedValue(true);
	});

	it("calls addUserToDefaultAudience when user email exists", async () => {
		const { syncUserToDefaultResendAudience } =
			await authUserAudienceModulePromise;

		await syncUserToDefaultResendAudience({
			id: "user-1",
			email: "person@example.com",
			name: "Person Example",
		});

		expect(addUserToDefaultAudienceMock).toHaveBeenCalledTimes(1);
		expect(addUserToDefaultAudienceMock).toHaveBeenCalledWith(
			"person@example.com",
			"Person Example"
		);
	});

	it("skips and logs a warning when email is missing", async () => {
		const { syncUserToDefaultResendAudience } =
			await authUserAudienceModulePromise;
		const { warnSpy, restore } = spyConsole();

		try {
			await syncUserToDefaultResendAudience({
				id: "user-2",
			});
		} finally {
			restore();
		}

		expect(addUserToDefaultAudienceMock).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it("does not throw and logs an error when enrollment returns false", async () => {
		const { syncUserToDefaultResendAudience } =
			await authUserAudienceModulePromise;
		const { errorSpy, restore } = spyConsole();
		addUserToDefaultAudienceMock.mockResolvedValue(false);

		try {
			await syncUserToDefaultResendAudience({
				id: "user-3",
				email: "person@example.com",
				name: "Person Example",
			});
		} finally {
			restore();
		}

		expect(addUserToDefaultAudienceMock).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});

	it("does not throw and logs an error when enrollment throws", async () => {
		const { syncUserToDefaultResendAudience } =
			await authUserAudienceModulePromise;
		const { errorSpy, restore } = spyConsole();
		addUserToDefaultAudienceMock.mockRejectedValue(new Error("resend failed"));

		try {
			await syncUserToDefaultResendAudience({
				id: "user-4",
				email: "person@example.com",
				name: "Person Example",
			});
		} finally {
			restore();
		}

		expect(addUserToDefaultAudienceMock).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledTimes(1);
	});
});
