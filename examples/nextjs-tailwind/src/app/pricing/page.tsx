import { SupportConfig } from "@cossistant/next/support-config";

export default function PricingPage() {
	return (
		<main className="mx-auto min-h-screen w-full max-w-3xl space-y-4 p-8">
			<SupportConfig
				quickOptions={[
					"How does billing work?",
					"What's included in Pro?",
					"Can I cancel anytime?",
				]}
			/>
			<h1 className="font-semibold text-3xl">Pricing</h1>
			<p className="text-slate-600">
				This page mirrors docs usage of SupportConfig.
			</p>
		</main>
	);
}
