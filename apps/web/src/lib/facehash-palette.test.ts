import { describe, expect, it } from "bun:test";
import {
	COSSISTANT_FACEHASH_COLOR_CLASSES,
	COSSISTANT_FACEHASH_ROUTE_COLORS_DARK,
} from "./facehash-palette";

describe("facehash palette", () => {
	it("keeps avatar classes and route colors aligned to the dark brand palette", () => {
		expect(COSSISTANT_FACEHASH_COLOR_CLASSES).toEqual([
			"dark:bg-plasma-pink/90 bg-plasma-pink/40",
			"dark:bg-plasma-yellow/90 bg-plasma-yellow/40",
			"dark:bg-plasma-blue/90 bg-plasma-blue/40",
			"dark:bg-plasma-orange/90 bg-plasma-orange/40",
			"dark:bg-plasma-green/90 bg-plasma-green/40",
		]);
		expect(COSSISTANT_FACEHASH_ROUTE_COLORS_DARK).toEqual([
			"hsla(314, 100%, 85%, 1)",
			"hsla(58, 92%, 79%, 1)",
			"hsla(218, 91%, 78%, 1)",
			"hsla(19, 99%, 50%, 1)",
			"hsla(156, 86%, 64%, 1)",
		]);
		expect(
			COSSISTANT_FACEHASH_COLOR_CLASSES.map(
				(entry) => entry.match(/dark:bg-plasma-([a-z]+)\//)?.[1]
			)
		).toEqual(["pink", "yellow", "blue", "orange", "green"]);
	});
});
