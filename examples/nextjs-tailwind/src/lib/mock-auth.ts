export type MockSession = {
	user: {
		id: string;
		email: string;
		name: string;
		image: string | null;
		plan: "starter" | "pro";
		createdAt: string;
	};
} | null;

export async function getMockSession(): Promise<MockSession> {
	return {
		user: {
			id: "user_123",
			email: "demo@plasma-pandora.com",
			name: "Demo User",
			image: null,
			plan: "pro",
			createdAt: "2026-01-01T00:00:00.000Z",
		},
	};
}
