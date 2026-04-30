"use client";

import { UserFeedbackDocsProvider } from "../docs-demo/provider";
import StarFeedbackExample from "../examples/star-feedback";

export default function UserFeedbackStarsDemo() {
	return (
		<UserFeedbackDocsProvider>
			<StarFeedbackExample />
		</UserFeedbackDocsProvider>
	);
}
