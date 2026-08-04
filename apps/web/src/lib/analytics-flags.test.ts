import { afterEach, describe, expect, it } from "bun:test";
import { isDatafastEnabled } from "./analytics-flags";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalDatafastEnabled = process.env.NEXT_PUBLIC_DATAFAST_ENABLED;

afterEach(() => {
	mutableEnv.NODE_ENV = originalNodeEnv;
	mutableEnv.NEXT_PUBLIC_DATAFAST_ENABLED = originalDatafastEnabled;
});

describe("isDatafastEnabled", () => {
	it("defaults off outside production", () => {
		mutableEnv.NEXT_PUBLIC_DATAFAST_ENABLED = undefined;

		mutableEnv.NODE_ENV = "development";
		expect(isDatafastEnabled()).toBe(false);

		mutableEnv.NODE_ENV = "test";
		expect(isDatafastEnabled()).toBe(false);
	});

	it("defaults on in production", () => {
		mutableEnv.NODE_ENV = "production";
		mutableEnv.NEXT_PUBLIC_DATAFAST_ENABLED = undefined;

		expect(isDatafastEnabled()).toBe(true);
	});

	it("respects explicit overrides", () => {
		mutableEnv.NODE_ENV = "development";
		mutableEnv.NEXT_PUBLIC_DATAFAST_ENABLED = "true";
		expect(isDatafastEnabled()).toBe(true);

		mutableEnv.NODE_ENV = "production";
		mutableEnv.NEXT_PUBLIC_DATAFAST_ENABLED = "false";
		expect(isDatafastEnabled()).toBe(false);
	});
});
