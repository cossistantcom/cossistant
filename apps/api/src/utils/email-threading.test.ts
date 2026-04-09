import { afterEach, describe, expect, it } from "bun:test";
import { env } from "@api/env";
import {
	generateInboundReplyAddress,
	parseInboundReplyAddress,
} from "./email-threading";

const originalNodeEnv = env.NODE_ENV;
const originalProvider = env.EMAIL_TRANSPORT_PROVIDER;
const originalResendDomain = env.EMAIL_RESEND_INBOUND_DOMAIN;
const originalSesDomain = env.EMAIL_SES_INBOUND_DOMAIN;

afterEach(() => {
	env.NODE_ENV = originalNodeEnv;
	env.EMAIL_TRANSPORT_PROVIDER = originalProvider;
	env.EMAIL_RESEND_INBOUND_DOMAIN = originalResendDomain;
	env.EMAIL_SES_INBOUND_DOMAIN = originalSesDomain;
});

describe("email threading inbound domains", () => {
	it("uses the Resend inbound domain by default", () => {
		env.NODE_ENV = "development";
		env.EMAIL_TRANSPORT_PROVIDER = "resend";
		env.EMAIL_RESEND_INBOUND_DOMAIN = "inbound.example.com";

		expect(
			generateInboundReplyAddress({
				conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			})
		).toBe("test-conv-01ARZ3NDEKTSV4RRFFQ69G5FAV@inbound.example.com");
	});

	it("switches new reply addresses to the SES inbound domain when the provider flag flips", () => {
		env.NODE_ENV = "production";
		env.EMAIL_TRANSPORT_PROVIDER = "ses";
		env.EMAIL_SES_INBOUND_DOMAIN = "ses-inbound.example.com";

		expect(
			generateInboundReplyAddress({
				conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			})
		).toBe("conv-01ARZ3NDEKTSV4RRFFQ69G5FAV@ses-inbound.example.com");
	});

	it("parses both resend and ses inbound domains and reports the provider", () => {
		env.EMAIL_RESEND_INBOUND_DOMAIN = "inbound.example.com";
		env.EMAIL_SES_INBOUND_DOMAIN = "ses-inbound.example.com";

		expect(
			parseInboundReplyAddress(
				"test-conv-01arz3ndektsv4rrffq69g5fav@inbound.example.com"
			)
		).toEqual({
			conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			environment: "test",
			provider: "resend",
		});

		expect(
			parseInboundReplyAddress(
				"conv-01arz3ndektsv4rrffq69g5fav@ses-inbound.example.com"
			)
		).toEqual({
			conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
			environment: "production",
			provider: "ses",
		});
	});
});
