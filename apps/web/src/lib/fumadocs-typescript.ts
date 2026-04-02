import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
	createFileSystemGeneratorCache,
	createGenerator,
	type DocEntry,
	type GeneratedDoc,
	type Generator,
} from "fumadocs-typescript";

function isAppRoot(dir: string): boolean {
	return (
		existsSync(resolve(dir, "package.json")) &&
		existsSync(resolve(dir, "source.config.ts"))
	);
}

function findAppRoot(startDir: string): string | null {
	let currentDir = resolve(startDir);

	while (true) {
		if (isAppRoot(currentDir)) {
			return currentDir;
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}

		currentDir = parentDir;
	}
}

function resolveAppRoot(): string {
	const cwd = process.cwd();
	const candidates = [
		cwd,
		resolve(cwd, "apps", "web"),
		resolve(cwd, ".source"),
		resolve(cwd, ".next"),
	];

	for (const candidate of candidates) {
		const appRoot = findAppRoot(candidate);
		if (appRoot) {
			return appRoot;
		}
	}

	throw new Error(
		`Unable to resolve the apps/web root from working directory: ${cwd}`
	);
}

const APP_ROOT = resolveAppRoot();
export const DOCS_TYPE_TABLE_BASE_PATH = resolve(APP_ROOT, "../..");

const rawDocsTypeTableGenerator = createGenerator({
	cache: createFileSystemGeneratorCache(
		resolve(APP_ROOT, ".next", "fumadocs-typescript")
	),
	tsconfigPath: resolve(APP_ROOT, "tsconfig.json"),
});

const GENERIC_SIMPLIFIED_TYPES = new Set([
	"array",
	"function",
	"object",
	"union",
]);

const SUPPORT_COMPONENT_TYPES_DOC_PATH = "/docs/support-component/types";

const SUPPORT_COMPONENT_TYPE_DOCS = {
	AIAgent: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#aiagent`,
	Conversation: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#conversation`,
	PlasmaClient: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#cossistantclient`,
	DefaultMessage: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#defaultmessage`,
	HumanAgent: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#humanagent`,
	IdentifyParams: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#identifyparams`,
	MessageComposer: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#messagecomposer`,
	PublicContact: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#publiccontact`,
	PublicVisitor: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#publicvisitor`,
	PublicWebsiteResponse: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#publicwebsiteresponse`,
	SenderType: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#sendertype`,
	SupportEvent: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#supportevent`,
	SupportHandle: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#supporthandle`,
	TimelineItem: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#timelineitem`,
	TriggerRenderProps: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#triggerrenderprops`,
	VisitorMetadata: `${SUPPORT_COMPONENT_TYPES_DOC_PATH}#visitormetadata`,
} as const;

const SUPPORT_COMPONENT_TYPE_DOCS_BY_ANCHOR = new Map(
	Object.values(SUPPORT_COMPONENT_TYPE_DOCS).map((href) => {
		const hashIndex = href.lastIndexOf("#");
		return [href.slice(hashIndex + 1), href];
	})
);

const GENERIC_TYPE_DISPLAY_LABELS: Record<string, string> = {
	array: "Array",
	function: "Function",
	object: "Object",
	union: "Union",
};

const COMPLEX_TYPE_DESCRIPTION_LENGTH = 120;

function normalizeTypeText(
	type: string,
	options: {
		stripUndefined?: boolean;
	} = {}
): string {
	const normalized = options.stripUndefined
		? type.replace(/\s+\|\s+undefined\b/g, "").trim()
		: type.trim();

	return normalized.replace(
		/^\(\((?<fn>.+?=>.+)\)\)$/s,
		(_match, fn: string) => fn
	);
}

function extractTypeDocKey(
	...types: Array<string | undefined>
): keyof typeof SUPPORT_COMPONENT_TYPE_DOCS | undefined {
	for (const type of types) {
		if (!type) {
			continue;
		}

		const matches = type.match(/\b[A-Z][A-Za-z0-9_]*/g) ?? [];
		for (const match of matches) {
			if (match in SUPPORT_COMPONENT_TYPE_DOCS) {
				return match as keyof typeof SUPPORT_COMPONENT_TYPE_DOCS;
			}
		}
	}

	return;
}

function isAbsoluteTypeDocHref(href: string): boolean {
	return (
		href.startsWith("/") ||
		href.startsWith("http://") ||
		href.startsWith("https://")
	);
}

function resolveTypeHref(
	typeHref: string | undefined,
	displayType: string
): string | undefined {
	if (typeHref) {
		const normalizedHref = typeHref.trim();

		if (isAbsoluteTypeDocHref(normalizedHref)) {
			return normalizedHref;
		}

		if (normalizedHref.startsWith("#")) {
			return (
				SUPPORT_COMPONENT_TYPE_DOCS_BY_ANCHOR.get(normalizedHref.slice(1)) ??
				normalizedHref
			);
		}

		return normalizedHref;
	}

	const docKey = extractTypeDocKey(displayType);
	if (!docKey) {
		return;
	}

	return SUPPORT_COMPONENT_TYPE_DOCS[docKey];
}

function resolveDisplayType(simplifiedType: string, type: string): string {
	const normalizedSimplifiedType = simplifiedType.trim();
	const docKey = extractTypeDocKey(normalizedSimplifiedType, type);

	if (docKey) {
		if (
			normalizedSimplifiedType.length > 0 &&
			!GENERIC_SIMPLIFIED_TYPES.has(normalizedSimplifiedType.toLowerCase())
		) {
			return normalizedSimplifiedType;
		}

		return docKey;
	}

	const genericDisplayLabel =
		GENERIC_TYPE_DISPLAY_LABELS[normalizedSimplifiedType.toLowerCase()];
	if (genericDisplayLabel) {
		return genericDisplayLabel;
	}

	return normalizedSimplifiedType;
}

export function isComplexTypeDefinition(
	displayType: string,
	fullType: string
): boolean {
	const normalizedDisplayType = normalizeTypeText(displayType);
	const normalizedFullType = normalizeTypeText(fullType);

	return (
		GENERIC_SIMPLIFIED_TYPES.has(normalizedDisplayType.toLowerCase()) ||
		Object.values(GENERIC_TYPE_DISPLAY_LABELS).includes(
			normalizedDisplayType
		) ||
		normalizedFullType.includes("\n") ||
		normalizedFullType.length > COMPLEX_TYPE_DESCRIPTION_LENGTH ||
		(normalizedDisplayType !== normalizedFullType &&
			normalizedFullType.length > 96)
	);
}

function normalizeEntry(entry: DocEntry): DocEntry {
	const stripUndefined = !entry.required;
	const type = normalizeTypeText(entry.type, { stripUndefined });
	const simplifiedType = normalizeTypeText(entry.simplifiedType, {
		stripUndefined,
	});
	const displayType = resolveDisplayType(simplifiedType, type);

	return {
		...entry,
		type,
		simplifiedType: displayType,
		typeHref: resolveTypeHref(entry.typeHref, displayType),
	};
}

function normalizeDoc(doc: GeneratedDoc): GeneratedDoc {
	return {
		...doc,
		entries: doc.entries.map(normalizeEntry),
	};
}

export const docsTypeTableGenerator: Generator = {
	async generateDocumentation(file, name, options) {
		const docs = await rawDocsTypeTableGenerator.generateDocumentation(
			file,
			name,
			options
		);

		return docs.map(normalizeDoc);
	},
	async generateTypeTable(props, options) {
		const docs = await rawDocsTypeTableGenerator.generateTypeTable(
			props,
			options
		);

		return docs.map(normalizeDoc);
	},
};
