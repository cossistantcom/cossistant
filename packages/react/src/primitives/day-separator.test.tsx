import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DaySeparator } from "./day-separator";

describe("DaySeparator SSR output", () => {
	it("renders a deterministic absolute date on the server instead of Today", () => {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		const html = renderToStaticMarkup(
			<DaySeparator date={today} dateString="today">
				{({ formattedDate, isToday }) => (
					<span data-is-today={String(isToday)}>{formattedDate}</span>
				)}
			</DaySeparator>
		);

		expect(html).not.toContain("Today");
		expect(html).toContain('data-is-today="false"');
		expect(html).toContain(
			today.toLocaleDateString("en-US", {
				year: "numeric",
				month: "long",
				day: "numeric",
			})
		);
	});

	it("applies consumer-provided formatters on the server as-is", () => {
		const html = renderToStaticMarkup(
			<DaySeparator
				date={new Date("2024-01-15T00:00:00.000Z")}
				dateString="2024-01-15"
				formatDate={() => "custom label"}
			/>
		);

		expect(html).toContain("custom label");
	});
});
