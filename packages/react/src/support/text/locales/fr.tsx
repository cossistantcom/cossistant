import type { SupportLocaleMessages } from "./keys";

const fr: SupportLocaleMessages = {
	"common.actions.askQuestion": "Posez-nous une question",
	"common.actions.attachFiles": "Joindre des fichiers",
	"common.actions.removeFile": ({ variables }) =>
		`Supprimer ${variables.fileName}`,
	"common.brand.watermark": "Propulsé par",
	"common.fallbacks.aiAssistant": "Assistant IA",
	"common.fallbacks.cossistant": "Cossistant",
	"common.fallbacks.someone": "Quelqu'un",
	"common.fallbacks.supportTeam": "Équipe support",
	"common.fallbacks.unknown": "Inconnu",
	"common.fallbacks.you": "Vous",
	"common.labels.aiAgentIndicator": "Agent IA",
	"common.labels.supportOnline": "Support en ligne",
	"page.conversationHistory.showMore": ({ variables, utils }) =>
		`+${utils.formatNumber(variables.count)} de plus`,
	"page.conversationHistory.title": "Historique des conversations",
	"page.home.greeting": ({ variables, context, utils }) => {
		const period = utils.timeOfDay();
		const prefixes: Record<typeof period.token, string> = {
			morning: "Bonjour",
			afternoon: "Bon après-midi",
			evening: "Bonsoir",
		};
		const prefix = prefixes[period.token];
		const visitorName =
			variables?.visitorName || context.visitor?.contact?.name;
		return `${prefix}${visitorName ? ` ${visitorName}` : ""}, comment pouvons-nous vous aider ?`;
	},
	"page.home.history.more": ({ variables, utils }) => {
		const count = variables.count;
		const noun = utils.pluralize(count, {
			one: "conversation supplémentaire",
			other: "conversations supplémentaires",
		});
		return `+ ${utils.formatNumber(count)} ${noun}`;
	},
	"page.home.tagline": ({ variables, context, utils }) => {
		const websiteName = variables?.websiteName || context.website?.name || "";
		return websiteName ? `Support ${utils.titleCase(websiteName)}` : "Support";
	},
	"component.conversationButtonLink.fallbackTitle": "Conversation sans titre",
	"component.conversationButtonLink.lastMessage.agent": ({ variables }) =>
		`${variables.name} - ${variables.time}`,
	"component.conversationButtonLink.lastMessage.visitor": ({ variables }) =>
		`Vous - ${variables.time}`,
	"component.conversationButtonLink.typing": ({ variables }) =>
		`${variables.name} est en train d'écrire...`,
	"component.conversationButtonLink.status.open": "Ouverte",
	"component.conversationButtonLink.status.resolved": "Résolue",
	"component.conversationButtonLink.status.closed": "Fermée",
	"component.conversationButtonLink.status.spam": "Indésirable",
	"component.conversationEvent.assigned": ({ variables }) =>
		`${variables.actorName} a attribué la conversation`,
	"component.conversationEvent.unassigned": ({ variables }) =>
		`${variables.actorName} a retiré l'attribution de la conversation`,
	"component.conversationEvent.default": ({ variables }) =>
		`${variables.actorName} a effectué une action`,
	"component.conversationEvent.participantJoined": ({ variables }) =>
		`${variables.actorName} a rejoint la conversation`,
	"component.conversationEvent.participantLeft": ({ variables }) =>
		`${variables.actorName} a quitté la conversation`,
	"component.conversationEvent.participantRequested": ({ variables }) =>
		`${variables.actorName} a demandé à un membre de l'équipe de rejoindre`,
	"component.conversationEvent.priorityChanged": ({ variables }) =>
		`${variables.actorName} a modifié la priorité`,
	"component.conversationEvent.reopened": ({ variables }) =>
		`${variables.actorName} a rouvert la conversation`,
	"component.conversationEvent.resolved": ({ variables }) =>
		`${variables.actorName} a résolu la conversation`,
	"component.conversationEvent.statusChanged": ({ variables }) =>
		`${variables.actorName} a modifié le statut`,
	"component.conversationEvent.tagAdded": ({ variables }) =>
		`${variables.actorName} a ajouté une étiquette`,
	"component.conversationEvent.tagRemoved": ({ variables }) =>
		`${variables.actorName} a retiré une étiquette`,
	"component.conversationEvent.visitorBlocked": ({ variables }) =>
		`${variables.actorName} a bloqué le visiteur`,
	"component.conversationEvent.visitorUnblocked": ({ variables }) =>
		`${variables.actorName} a débloqué le visiteur`,
	"component.conversationEvent.visitorIdentified": () =>
		"Coordonnées confirmées",
	"component.identificationTool.title": "Partagez votre e-mail",
	"component.identificationTool.description":
		"Laissez-nous votre adresse e-mail afin que nous puissions vous recontacter.",
	"component.identificationTool.cta": "Partager l'e-mail",
	"component.identificationTool.loading": "Enregistrement...",
	"component.identificationTool.success":
		"Merci ! Nous utiliserons cette adresse si nous devons vous recontacter.",
	"component.identificationTool.error":
		"Impossible d'enregistrer votre e-mail. Veuillez réessayer.",
	"component.identificationTool.validation":
		"Veuillez saisir une adresse e-mail pour continuer.",
	"component.identificationTool.inputPlaceholder": "vous@example.com",
	"component.identificationTool.inputLabel": "Adresse e-mail",
	"component.identificationTool.eventLog":
		"Le visiteur a confirmé son adresse e-mail",
	"component.conversationPage.closedMessage":
		"Cette conversation est close, commencez-en une nouvelle pour discuter avec nous",
	"component.conversationPage.spamMessage":
		"Cette conversation a été marquée comme indésirable.",
	"component.conversationPage.ratingPrompt": "Comment avons-nous fait ?",
	"component.conversationPage.ratingThanks": "Merci pour votre retour !",
	"component.conversationPage.ratingLabel": ({ variables, utils }) => {
		const noun = utils.pluralize(variables.rating, {
			one: "étoile",
			other: "étoiles",
		});
		return `Noter ${variables.rating} ${noun}`;
	},
	"component.conversationPage.commentPlaceholder":
		"Dites-nous en plus sur votre expérience (optionnel)",
	"component.conversationPage.submitFeedback": "Envoyer le retour",
	"component.multimodalInput.placeholder": "Écrivez votre message...",
	"component.multimodalInput.remove": ({ variables }) =>
		`Supprimer ${variables.fileName}`,
	"component.navigation.articles": "Articles",
	"component.navigation.home": "Accueil",
	"component.message.timestamp.aiIndicator": "• Agent IA",
	"component.message.feedback.label": "Retour",
};

export default fr;
