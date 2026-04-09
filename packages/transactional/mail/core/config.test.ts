import { afterEach, describe, expect, it } from "bun:test";
import { getEmailTransportProvider } from "./config";

const originalProvider = process.env.EMAIL_TRANSPORT_PROVIDER;

afterEach(() => {
	if (originalProvider == null) {
		process.env.EMAIL_TRANSPORT_PROVIDER = undefined;
		return;
	}

	process.env.EMAIL_TRANSPORT_PROVIDER = originalProvider;
});

describe("mail transport provider config", () => {
	it("defaults to resend when the env var is missing", () => {
		process.env.EMAIL_TRANSPORT_PROVIDER = undefined;

		expect(getEmailTransportProvider()).toBe("resend");
	});

	it("accepts resend explicitly", () => {
		process.env.EMAIL_TRANSPORT_PROVIDER = "resend";

		expect(getEmailTransportProvider()).toBe("resend");
	});

	it("accepts ses explicitly", () => {
		process.env.EMAIL_TRANSPORT_PROVIDER = "ses";

		expect(getEmailTransportProvider()).toBe("ses");
	});

	it("throws for unsupported providers", () => {
		process.env.EMAIL_TRANSPORT_PROVIDER = "mailgun";

		expect(() => getEmailTransportProvider()).toThrow(
			'Invalid EMAIL_TRANSPORT_PROVIDER value "mailgun". Expected "resend" or "ses".'
		);
	});
});
