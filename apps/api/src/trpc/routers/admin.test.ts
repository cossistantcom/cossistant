import { beforeEach, describe, expect, it, mock } from "bun:test";

const banUserMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=ban" }),
	response: {},
}));
const unbanUserMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=unban" }),
	response: {},
}));
const revokeUserSessionsMock = mock(async () => ({
	headers: new Headers(),
	response: {},
}));
const impersonateUserMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=impersonate" }),
	response: {},
}));
const stopImpersonatingMock = mock(async () => ({
	headers: new Headers({ "set-cookie": "session=admin" }),
	response: {},
}));

mock.module("@api/lib/auth", () => ({
	auth: {
		api: {
			banUser: banUserMock,
			unbanUser: unbanUserMock,
			revokeUserSessions: revokeUserSessionsMock,
			impersonateUser: impersonateUserMock,
			stopImpersonating: stopImpersonatingMock,
		},
	},
}));

const modulePromise = Promise.all([import("../init"), import("./admin")]);

function createThenableBuilder(result: unknown) {
	const builder = {
		from: () => builder,
		innerJoin: () => builder,
		where: () => builder,
		orderBy: () => builder,
		limit: () => Promise.resolve(result),
		// biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are thenable, and these tests fake that contract.
		then: (
			resolve: (value: unknown) => unknown,
			reject: (reason: unknown) => unknown
		) => Promise.resolve(result).then(resolve, reject),
	};

	return builder;
}

function createDb(selectResults: unknown[]) {
	let selectIndex = 0;

	return {
		select: mock(() => {
			const result = selectResults[selectIndex] ?? [];
			selectIndex += 1;
			return createThenableBuilder(result);
		}),
	};
}

async function createCaller(
	options: {
		role?: string | null;
		db?: unknown;
		impersonatedBy?: string | null;
		appendResponseHeader?: (name: string, value: string) => void;
	} = {}
) {
	const [{ createCallerFactory }, { adminRouter }] = await modulePromise;
	const createCallerFactoryForRouter = createCallerFactory(adminRouter);

	return createCallerFactoryForRouter({
		db: (options.db ?? createDb([])) as never,
		user: {
			id: "admin-user",
			name: "Admin User",
			email: "admin@cossistant.com",
			role: options.role ?? "admin",
		} as never,
		session: {
			id: "session-1",
			impersonatedBy: options.impersonatedBy ?? null,
		} as never,
		geo: {} as never,
		headers: new Headers(),
		appendResponseHeader: options.appendResponseHeader,
	});
}

function createUser(overrides: Record<string, unknown> = {}) {
	return {
		id: "user-1",
		name: "User One",
		email: "user@example.com",
		emailVerified: true,
		image: null,
		isAnonymous: false,
		createdAt: new Date("2026-04-01T10:00:00.000Z"),
		updatedAt: new Date("2026-04-02T10:00:00.000Z"),
		lastSeenAt: null,
		role: "user",
		banned: false,
		banReason: null,
		banExpires: null,
		...overrides,
	};
}

describe("admin router", () => {
	beforeEach(() => {
		banUserMock.mockClear();
		unbanUserMock.mockClear();
		revokeUserSessionsMock.mockClear();
		impersonateUserMock.mockClear();
		stopImpersonatingMock.mockClear();
	});

	it("rejects non-admin users before admin operations run", async () => {
		const caller = await createCaller({ role: "user" });

		await expect(caller.listUsers({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(caller.banUser({ userId: "user-1" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(caller.unbanUser({ userId: "user-1" })).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.revokeUserSessions({ userId: "user-1" })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.impersonateUser({ userId: "user-1" })
		).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	it("returns the latest 40 serialized users", async () => {
		const db = createDb([
			[
				createUser({
					id: "user-2",
					email: "latest@example.com",
					createdAt: new Date("2026-04-02T10:00:00.000Z"),
					banned: true,
					banReason: "Spam",
				}),
				createUser(),
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.listUsers({});

		expect(result.limit).toBe(40);
		expect(result.users).toEqual([
			{
				id: "user-2",
				name: "User One",
				email: "latest@example.com",
				image: null,
				role: "user",
				banned: true,
				banReason: "Spam",
				banExpires: null,
				createdAt: "2026-04-02T10:00:00.000Z",
				updatedAt: "2026-04-02T10:00:00.000Z",
				lastSeenAt: null,
			},
			{
				id: "user-1",
				name: "User One",
				email: "user@example.com",
				image: null,
				role: "user",
				banned: false,
				banReason: null,
				banExpires: null,
				createdAt: "2026-04-01T10:00:00.000Z",
				updatedAt: "2026-04-02T10:00:00.000Z",
				lastSeenAt: null,
			},
		]);
	});

	it("groups a user's active websites by organization", async () => {
		const db = createDb([
			[
				{
					organizationId: "org-1",
					organizationName: "Acme",
					organizationSlug: "acme",
					role: "admin",
					joinedAt: new Date("2026-04-01T10:00:00.000Z"),
				},
			],
			[{ teamId: "team-2", organizationId: "org-2" }],
			[{ id: "org-2", name: "Beta", slug: "beta" }],
			[
				{
					id: "site-1",
					name: "Acme Site",
					slug: "acme-site",
					domain: "acme.com",
					logoUrl: null,
					organizationId: "org-1",
					teamId: "team-1",
					createdAt: "2026-04-02T10:00:00.000Z",
				},
				{
					id: "site-2",
					name: "Beta Site",
					slug: "beta-site",
					domain: "beta.com",
					logoUrl: null,
					organizationId: "org-2",
					teamId: "team-2",
					createdAt: "2026-04-02T10:00:00.000Z",
				},
			],
		]);
		const caller = await createCaller({ db });

		const result = await caller.getUserWebsites({ userId: "user-1" });

		expect(result.organizations).toEqual([
			{
				id: "org-1",
				name: "Acme",
				slug: "acme",
				role: "admin",
				joinedAt: "2026-04-01T10:00:00.000Z",
				websites: [
					{
						id: "site-1",
						name: "Acme Site",
						slug: "acme-site",
						domain: "acme.com",
						logoUrl: null,
						accessSource: "organization",
						createdAt: "2026-04-02T10:00:00.000Z",
					},
				],
			},
			{
				id: "org-2",
				name: "Beta",
				slug: "beta",
				role: null,
				joinedAt: null,
				websites: [
					{
						id: "site-2",
						name: "Beta Site",
						slug: "beta-site",
						domain: "beta.com",
						logoUrl: null,
						accessSource: "team",
						createdAt: "2026-04-02T10:00:00.000Z",
					},
				],
			},
		]);
	});

	it("delegates safe admin actions through Better Auth and appends cookies", async () => {
		const cookies: string[] = [];
		const caller = await createCaller({
			appendResponseHeader: (name, value) => {
				if (name.toLowerCase() === "set-cookie") {
					cookies.push(value);
				}
			},
		});

		await caller.banUser({ userId: "user-1" });
		await caller.unbanUser({ userId: "user-1" });
		await caller.revokeUserSessions({ userId: "user-1" });
		await caller.impersonateUser({ userId: "user-1" });

		expect(banUserMock).toHaveBeenCalledTimes(1);
		expect(unbanUserMock).toHaveBeenCalledTimes(1);
		expect(revokeUserSessionsMock).toHaveBeenCalledTimes(1);
		expect(impersonateUserMock).toHaveBeenCalledTimes(1);
		expect(cookies).toEqual([
			"session=ban",
			"session=unban",
			"session=impersonate",
		]);
	});

	it("allows stopping impersonation only from an impersonated session", async () => {
		const regularCaller = await createCaller({ role: "user" });

		await expect(regularCaller.stopImpersonating()).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});

		const impersonatedCaller = await createCaller({
			role: "user",
			impersonatedBy: "admin-user",
		});

		await impersonatedCaller.stopImpersonating();

		expect(stopImpersonatingMock).toHaveBeenCalledTimes(1);
	});

	it("does not expose dangerous Better Auth defaults", async () => {
		const caller = await createCaller();

		expect("removeUser" in caller).toBe(false);
		expect("setRole" in caller).toBe(false);
		expect("setUserPassword" in caller).toBe(false);
		expect("createUser" in caller).toBe(false);
	});
});
