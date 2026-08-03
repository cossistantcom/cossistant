"use client";

import { Support, useSupportNavigation } from "@cossistant/next/support";

const HelpPage = () => {
	const { navigate } = useSupportNavigation();

	return (
		<div className="space-y-3 p-4">
			<button
				className="cursor-pointer rounded border px-3 py-1"
				onClick={() => navigate({ page: "ARTICLES" })}
				type="button"
			>
				View articles
			</button>
			<h2 className="font-semibold text-xl">Help Center</h2>
			<p className="text-slate-600">
				Custom route rendered through Support.Page.
			</p>
		</div>
	);
};

export default function CustomPageExample() {
	return (
		<main className="mx-auto min-h-screen w-full max-w-3xl space-y-4 p-8">
			<h1 className="font-semibold text-3xl">Custom Page Example</h1>
			<Support>
				<Support.Page component={HelpPage} name="HOME" />
			</Support>
		</main>
	);
}
