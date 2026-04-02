import type { ThemeRegistration } from "shiki";

export const cossistantLight: ThemeRegistration = {
	name: "cossistant-light",
	colors: {
		"editor.background": "#ffffff",
		"editor.foreground": "#24292e",
		"activityBar.background": "#ffffff",
		"activityBar.foreground": "#24292e",
		"sideBar.background": "#f6f8fa",
		"sideBar.foreground": "#586069",
		"editor.lineHighlightBackground": "#f6f8fa",
		"editorLineNumber.foreground": "#959da5",
		"editorCursor.foreground": "#24292e",
		"editor.selectionBackground": "#c8c8fa40",
		"editor.inactiveSelectionBackground": "#c8c8fa25",
	},
	tokenColors: [
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: {
				foreground: "#6a737d",
			},
		},
		{
			scope: ["string", "string.quoted"],
			settings: {
				foreground: "var(--plasma-pink)",
			},
		},
		{
			scope: ["keyword", "storage.type", "storage.modifier"],
			settings: {
				foreground: "var(--plasma-orange)",
			},
		},
		{
			scope: ["entity.name.function", "entity.name.method"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
		{
			scope: ["variable", "variable.other"],
			settings: {
				foreground: "#24292e",
			},
		},
		{
			scope: ["constant", "constant.numeric", "constant.language"],
			settings: {
				foreground: "var(--plasma-yellow)",
			},
		},
		{
			scope: ["entity.name.type", "entity.name.class", "support.class"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
		{
			scope: ["support.function", "support.variable"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
		{
			scope: ["punctuation", "meta.brace"],
			settings: {
				foreground: "#24292e",
			},
		},
		{
			scope: ["entity.name.tag"],
			settings: {
				foreground: "var(--plasma-orange)",
			},
		},
		{
			scope: ["entity.other.attribute-name"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
	],
};

export const cossistantDark: ThemeRegistration = {
	name: "cossistant-dark",
	colors: {
		"editor.background": "#0d1117",
		"editor.foreground": "#c9d1d9",
		"activityBar.background": "#0d1117",
		"activityBar.foreground": "#c9d1d9",
		"sideBar.background": "#010409",
		"sideBar.foreground": "#8b949e",
		"editor.lineHighlightBackground": "#161b22",
		"editorLineNumber.foreground": "#8b949e",
		"editorCursor.foreground": "#c9d1d9",
		"editor.selectionBackground": "#3392ff44",
		"editor.inactiveSelectionBackground": "#3392ff22",
	},
	tokenColors: [
		{
			scope: ["comment", "punctuation.definition.comment"],
			settings: {
				foreground: "#8b949e",
			},
		},
		{
			scope: ["string", "string.quoted"],
			settings: {
				foreground: "var(--plasma-pink)",
			},
		},
		{
			scope: ["keyword", "storage.type", "storage.modifier"],
			settings: {
				foreground: "var(--plasma-orange)",
			},
		},
		{
			scope: ["entity.name.function", "entity.name.method"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
		{
			scope: ["variable", "variable.other"],
			settings: {
				foreground: "#c9d1d9",
			},
		},
		{
			scope: ["constant", "constant.numeric", "constant.language"],
			settings: {
				foreground: "var(--plasma-yellow)",
			},
		},
		{
			scope: ["entity.name.type", "entity.name.class", "support.class"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
		{
			scope: ["support.function", "support.variable"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
		{
			scope: ["punctuation", "meta.brace"],
			settings: {
				foreground: "#c9d1d9",
			},
		},
		{
			scope: ["entity.name.tag"],
			settings: {
				foreground: "var(--plasma-orange)",
			},
		},
		{
			scope: ["entity.other.attribute-name"],
			settings: {
				foreground: "var(--plasma-blue)",
			},
		},
	],
};
