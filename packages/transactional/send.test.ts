import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PreparedMail } from "./mail/core/types";

const prepareMailMock = mock(
	async () =>
		({
			to: ["person@example.com"],
			from: "support@example.com",
			subject: "Test email",
			text: "Hello",
		}) satisfies PreparedMail
);

const sendMock = mock(
	async () =>
		({
			data: { id: "email-1" },
			error: null,
		}) as { data: unknown; error: Error | null }
);

const sendBatchMock = mock(
	async () =>
		({
			data: [{ id: "email-1" }],
			error: null,
		}) as { data: unknown; error: Error | null }
);

mock.module("./mail/core/prepare-mail", () => ({
	prepareMail: prepareMailMock,
}));

mock.module("./mail/core/get-mail-transport", () => ({
	getMailTransport: () => ({
		send: sendMock,
		sendBatch: sendBatchMock,
	}),
}));

const sendModulePromise = import("./send");

describe("transactional send", () => {
	beforeEach(() => {
		prepareMailMock.mockReset();
		prepareMailMock.mockResolvedValue({
			to: ["person@example.com"],
			from: "support@example.com",
			subject: "Test email",
			text: "Hello",
		} satisfies PreparedMail);

		sendMock.mockReset();
		sendMock.mockResolvedValue({
			data: { id: "email-1" },
			error: null,
		});

		sendBatchMock.mockReset();
		sendBatchMock.mockResolvedValue({
			data: [{ id: "email-1" }],
			error: null,
		});
	});

	it("throws when the selected provider returns an error", async () => {
		const { sendEmail } = await sendModulePromise;
		sendMock.mockResolvedValue({
			data: null,
			error: new Error("SES credentials missing"),
		});

		await expect(
			sendEmail({
				to: "person@example.com",
				subject: "Hello",
				text: "Hello",
			})
		).rejects.toThrow("SES credentials missing");
	});

	it("returns the provider result when sending succeeds", async () => {
		const { sendEmail } = await sendModulePromise;

		const result = await sendEmail({
			to: "person@example.com",
			subject: "Hello",
			text: "Hello",
		});

		expect(result).toEqual({
			data: { id: "email-1" },
			error: null,
		});
	});

	it("throws when batch sending returns an error", async () => {
		const { sendBatchEmail } = await sendModulePromise;
		sendBatchMock.mockResolvedValue({
			data: null,
			error: new Error("SES batch failed"),
		});

		await expect(
			sendBatchEmail([
				{
					to: "person@example.com",
					subject: "Hello",
					text: "Hello",
				},
			])
		).rejects.toThrow("SES batch failed");
	});
});
