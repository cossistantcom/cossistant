import { render, toPlainText } from "@react-email/render";
import type { MailSendOptions } from "./types";

export async function renderMailContent(options: MailSendOptions): Promise<{
	html?: string;
	text?: string;
}> {
	if (!options.react) {
		return {
			text: options.text,
		};
	}

	const html = await render(options.react);
	const text = options.text ?? toPlainText(html);

	return {
		html,
		text,
	};
}
