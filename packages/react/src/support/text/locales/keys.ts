import type {
	AvailableAIAgent,
	AvailableHumanAgent,
	PublicWebsiteResponse,
} from "@cossistant/types";

export type SupportLocale = "en" | "fr" | "es";

export type SupportTimeOfDayToken = "morning" | "afternoon" | "evening";

export type SupportTimeOfDayValue = {
	token: SupportTimeOfDayToken;
	label: string;
};

export type SupportTextUtils = {
	formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
	pluralize: (count: number, options: { one: string; other: string }) => string;
	titleCase: (value: string) => string;
	timeOfDay: () => SupportTimeOfDayValue;
};

export type SupportTextContext = {
	website: PublicWebsiteResponse | null;
	visitor: PublicWebsiteResponse["visitor"] | null;
	humanAgents: AvailableHumanAgent[];
	aiAgents: AvailableAIAgent[];
};

type SupportTextDefinition<Vars> =
	| {
			variables: Vars;
			optional?: false;
	  }
	| {
			variables: Vars;
			optional: true;
	  };

export const supportTextDefinitions = {
	"common.actions.askQuestion": { variables: undefined },
	"common.actions.attachFiles": { variables: undefined },
	"common.actions.removeFile": { variables: { fileName: "" as string } },
	"common.brand.watermark": { variables: undefined },
	"common.fallbacks.aiAssistant": { variables: undefined },
	"common.fallbacks.cossistant": { variables: undefined },
	"common.fallbacks.someone": { variables: undefined },
	"common.fallbacks.supportTeam": { variables: undefined },
	"common.fallbacks.unknown": { variables: undefined },
	"common.fallbacks.you": { variables: undefined },
	"common.labels.aiAgentIndicator": { variables: undefined },
	"common.labels.supportOnline": { variables: undefined },
	"page.conversationHistory.showMore": { variables: { count: 0 as number } },
	"page.conversationHistory.title": { variables: undefined },
	"page.home.greeting": {
		variables: { visitorName: "" as string | undefined },
		optional: true,
	},
	"page.home.history.more": { variables: { count: 0 as number } },
	"page.home.tagline": {
		variables: { websiteName: "" as string | null },
		optional: true,
	},
	"component.conversationButtonLink.fallbackTitle": {
		variables: undefined,
	},
	"component.conversationButtonLink.lastMessage.agent": {
		variables: { name: "" as string, time: "" as string },
	},
	"component.conversationButtonLink.lastMessage.visitor": {
		variables: { time: "" as string },
	},
	"component.conversationButtonLink.typing": {
		variables: { name: "" as string },
	},
	"component.conversationButtonLink.status.open": {
		variables: undefined,
	},
	"component.conversationButtonLink.status.resolved": {
		variables: undefined,
	},
	"component.conversationButtonLink.status.closed": {
		variables: undefined,
	},
	"component.conversationButtonLink.status.spam": {
		variables: undefined,
	},
	"component.conversationEvent.assigned": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.unassigned": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.default": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.participantJoined": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.participantLeft": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.participantRequested": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.priorityChanged": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.reopened": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.resolved": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.statusChanged": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.tagAdded": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.tagRemoved": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.visitorBlocked": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.visitorUnblocked": {
		variables: { actorName: "" as string },
	},
	"component.conversationEvent.visitorIdentified": {
		variables: { actorName: "" as string },
	},
	"component.identificationTool.title": { variables: undefined },
	"component.identificationTool.description": { variables: undefined },
	"component.identificationTool.cta": { variables: undefined },
	"component.identificationTool.loading": { variables: undefined },
	"component.identificationTool.success": { variables: undefined },
	"component.identificationTool.error": { variables: undefined },
	"component.identificationTool.validation": { variables: undefined },
	"component.identificationTool.inputPlaceholder": { variables: undefined },
	"component.identificationTool.inputLabel": { variables: undefined },
	"component.identificationTool.eventLog": { variables: undefined },
	"component.conversationPage.closedMessage": {
		variables: undefined,
	},
	"component.conversationPage.spamMessage": {
		variables: undefined,
	},
	"component.conversationPage.ratingPrompt": {
		variables: undefined,
	},
	"component.conversationPage.ratingThanks": {
		variables: undefined,
	},
	"component.conversationPage.ratingLabel": {
		variables: { rating: 0 as number },
	},
	"component.conversationPage.commentPlaceholder": {
		variables: undefined,
	},
	"component.conversationPage.submitFeedback": {
		variables: undefined,
	},
	"component.multimodalInput.placeholder": {
		variables: undefined,
	},
	"component.multimodalInput.remove": {
		variables: { fileName: "" as string },
	},
	"component.navigation.articles": {
		variables: undefined,
	},
	"component.navigation.home": {
		variables: undefined,
	},
	"component.message.timestamp.aiIndicator": {
		variables: undefined,
	},
	"component.message.feedback.label": {
		variables: undefined,
	},
} as const satisfies Record<string, SupportTextDefinition<unknown>>;

export type SupportTextDefinitions = typeof supportTextDefinitions;
export type SupportTextKey = keyof SupportTextDefinitions;

export type SupportTextVariables<K extends SupportTextKey> =
	SupportTextDefinitions[K]["variables"];

type OptionalFlag<K extends SupportTextKey> =
	SupportTextDefinitions[K] extends { optional: true } ? true : false;

type MessageVariables<
	K extends SupportTextKey,
	Vars = SupportTextVariables<K>,
> = Vars extends undefined
	? undefined
	: OptionalFlag<K> extends true
		? Vars | undefined
		: Vars;

export type SupportTextMessage<
	K extends SupportTextKey,
	Vars = SupportTextVariables<K>,
> =
	| string
	| ((args: {
			variables: MessageVariables<K, Vars>;
			context: SupportTextContext;
			utils: SupportTextUtils;
	  }) => string);

export type SupportLocaleMessages = {
	[K in SupportTextKey]: SupportTextMessage<K>;
};

export type SupportTextContentOverrides<Locale extends string = SupportLocale> =
	Partial<{
		[K in SupportTextKey]:
			| SupportTextMessage<K>
			| Partial<Record<SupportLocale | Locale, SupportTextMessage<K>>>;
	}>;

export type SupportTextFormatter = {
	<K extends SupportTextKey>(
		key: K,
		variables: SupportTextVariables<K>
	): string;
	// biome-ignore lint/style/useUnifiedTypeSignatures: overload needed for strict variable checking
	<K extends SupportTextKey>(key: K): string;
};

type KeysWithVariables = {
	[K in SupportTextKey]: SupportTextVariables<K> extends undefined
		? never
		: OptionalFlag<K> extends true
			? never
			: K;
}[SupportTextKey];

export type StrictSupportTextFormatter = {
	<K extends KeysWithVariables>(
		key: K,
		variables: SupportTextVariables<K>
	): string;
	<K extends Exclude<SupportTextKey, KeysWithVariables>>(
		key: K,
		variables?: SupportTextVariables<K>
	): string;
};

export type SupportTextResolvedFormatter = StrictSupportTextFormatter &
	SupportTextFormatter;

export type UseSupportTextReturn = {
	/**
	 * Formatter function returned by `useSupportText()`.
	 *
	 * Call this with a support text key and optional interpolation variables.
	 *
	 * @remarks `SupportTextResolvedFormatter`
	 * @fumadocsType `SupportTextResolvedFormatter`
	 */
	format: SupportTextResolvedFormatter;
};

export type SupportTextProviderValue = {
	format: SupportTextResolvedFormatter;
	locale: string;
};
