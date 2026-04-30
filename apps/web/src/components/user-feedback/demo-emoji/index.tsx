"use client";

import { UserFeedbackDocsProvider } from "../docs-demo/provider";
import EmojiFeedbackExample from "../examples/emoji-feedback";

export default function UserFeedbackEmojiDemo() {
	return (
		<UserFeedbackDocsProvider>
			<EmojiFeedbackExample />
		</UserFeedbackDocsProvider>
	);
}
