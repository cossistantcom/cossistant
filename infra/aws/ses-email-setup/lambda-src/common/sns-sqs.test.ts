import { describe, expect, it } from "bun:test";
import { unwrapSnsMessagesFromSqsEvent } from "./sns-sqs";

describe("unwrapSnsMessagesFromSqsEvent", () => {
	it("unwraps SNS messages embedded in SQS records", () => {
		const messages = unwrapSnsMessagesFromSqsEvent<{ value: string }>({
			Records: [
				{
					body: JSON.stringify({
						Message: JSON.stringify({ value: "first" }),
					}),
				},
				{
					body: JSON.stringify({
						Message: JSON.stringify({ value: "second" }),
					}),
				},
			],
		});

		expect(messages).toEqual([{ value: "first" }, { value: "second" }]);
	});
});
