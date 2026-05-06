import type { SupportLocaleMessages } from "./keys";

const en: SupportLocaleMessages = {
	"common.actions.askQuestion": "Ask us a question",
	"common.actions.attachFiles": "Attach files",
	"common.actions.removeFile": ({ variables }) =>
		`Remove ${variables.fileName}`,
	"common.brand.watermark": "We run on",
	"common.fallbacks.aiAssistant": "AI assistant",
	"common.fallbacks.cossistant": "Cossistant",
	"common.fallbacks.someone": "Someone",
	"common.fallbacks.supportTeam": "Support team",
	"common.fallbacks.unknown": "Unknown",
	"common.fallbacks.you": "You",
	"common.labels.aiAgentIndicator": "AI agent",
	"common.labels.supportOnline": "Support online",
	"page.conversationHistory.showMore": ({ variables, utils }) =>
		`+${utils.formatNumber(variables.count)} more`,
	"page.conversationHistory.title": "Conversation history",
	"page.home.greeting": ({ variables, context, utils }) => {
		const period = utils.timeOfDay();
		const phrases: Record<typeof period.token, string> = {
			morning: "Morning",
			afternoon: "Afternoon",
			evening: "Evening",
		};
		const visitorName =
			variables?.visitorName || context.visitor?.contact?.name;
		return `${phrases[period.token]}${visitorName ? ` ${visitorName}` : ""}, how can we help?`;
	},
	"page.home.history.more": ({ variables, utils }) => {
		const count = variables.count;
		const noun = utils.pluralize(count, {
			one: "conversation",
			other: "conversations",
		});
		return `+ ${utils.formatNumber(count)} more ${noun}`;
	},
	"page.home.tagline": ({ variables, context, utils }) => {
		const websiteName = variables?.websiteName || context.website?.name || "";
		const formatted = websiteName
			? `${utils.titleCase(websiteName)} support`
			: "Support";
		return formatted;
	},
	"component.conversationButtonLink.fallbackTitle": "Untitled conversation",
	"component.conversationButtonLink.lastMessage.agent": ({ variables }) =>
		`${variables.name} - ${variables.time}`,
	"component.conversationButtonLink.lastMessage.visitor": ({ variables }) =>
		`You - ${variables.time}`,
	"component.conversationButtonLink.typing": ({ variables }) =>
		`${variables.name} is typing...`,
	"component.conversationButtonLink.status.open": "Open",
	"component.conversationButtonLink.status.resolved": "Resolved",
	"component.conversationButtonLink.status.spam": "Spam",
	"component.conversationButtonLink.status.closed": "closed",
	"component.conversationEvent.assigned": ({ variables }) =>
		`${variables.actorName} assigned the conversation`,
	"component.conversationEvent.unassigned": ({ variables }) =>
		`${variables.actorName} unassigned the conversation`,
	"component.conversationEvent.default": ({ variables }) =>
		`${variables.actorName} performed an action`,
	"component.conversationEvent.participantJoined": ({ variables }) =>
		`${variables.actorName} joined the conversation`,
	"component.conversationEvent.participantLeft": ({ variables }) =>
		`${variables.actorName} left the conversation`,
	"component.conversationEvent.participantRequested": ({ variables }) =>
		`${variables.actorName} requested a team member to join`,
	"component.conversationEvent.priorityChanged": ({ variables }) =>
		`${variables.actorName} changed the priority`,
	"component.conversationEvent.reopened": ({ variables }) =>
		`${variables.actorName} reopened the conversation`,
	"component.conversationEvent.resolved": ({ variables }) =>
		`${variables.actorName} resolved the conversation`,
	"component.conversationEvent.statusChanged": ({ variables }) =>
		`${variables.actorName} changed the status`,
	"component.conversationEvent.tagAdded": ({ variables }) =>
		`${variables.actorName} added a tag`,
	"component.conversationEvent.tagRemoved": ({ variables }) =>
		`${variables.actorName} removed a tag`,
	"component.conversationEvent.visitorBlocked": ({ variables }) =>
		`${variables.actorName} blocked the visitor`,
	"component.conversationEvent.visitorUnblocked": ({ variables }) =>
		`${variables.actorName} unblocked the visitor`,
	"component.conversationEvent.visitorIdentified": () =>
		"Contact details confirmed",
	"component.identificationTool.title": "Let us keep in touch",
	"component.identificationTool.description":
		"Leave your email so we can follow up on this conversation.",
	"component.identificationTool.cta": "Share email",
	"component.identificationTool.loading": "Saving...",
	"component.identificationTool.success":
		"Thanks! We'll reach out to you at this email if we need to.",
	"component.identificationTool.error":
		"We couldn't save your email. Please try again.",
	"component.identificationTool.validation":
		"Enter an email address to continue.",
	"component.identificationTool.inputPlaceholder": "you@example.com",
	"component.identificationTool.inputLabel": "Email address",
	"component.identificationTool.eventLog":
		"Visitor confirmed their email address",
	"component.conversationPage.closedMessage":
		"This conversation is closed, start a new one to talk with us",
	"component.conversationPage.spamMessage":
		"This conversation was marked as spam.",
	"component.conversationPage.ratingPrompt": "How did we do?",
	"component.conversationPage.ratingThanks": "Thanks for your feedback!",
	"component.conversationPage.ratingLabel": ({ variables, utils }) => {
		const noun = utils.pluralize(variables.rating, {
			one: "star",
			other: "stars",
		});
		return `Rate ${variables.rating} ${noun}`;
	},
	"component.conversationPage.commentPlaceholder":
		"Tell us more about your experience (optional)",
	"component.conversationPage.submitFeedback": "Submit feedback",
	"component.multimodalInput.placeholder": "Type your message...",
	"component.multimodalInput.remove": ({ variables }) =>
		`Remove ${variables.fileName}`,
	"component.navigation.articles": "Articles",
	"component.navigation.home": "Home",
	"component.message.timestamp.aiIndicator": "• AI agent",
	"component.message.feedback.label": "Feedback",
};

export default en;
