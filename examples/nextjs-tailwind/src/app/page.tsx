import { LazySupport } from "@cossistant/next/lazy-support";
import Link from "next/link";
import { Suspense } from "react";

export default function HomePage() {
	return (
		<main className="mx-auto flex min-h-[180vh] w-full max-w-3xl flex-col gap-6 p-8">
			<h1 className="font-semibold text-3xl">
				Next.js + Tailwind Integration Example
			</h1>
			<p className="text-slate-600">
				This app follows Cossistant docs patterns and fails typecheck when SDK
				integration drifts.
			</p>

			<ul className="list-disc space-y-2 pl-5 text-slate-700">
				<li>
					<Link className="underline" href="/pricing">
						SupportConfig quick options example
					</Link>
				</li>
				<li>
					<Link className="underline" href="/dashboard">
						IdentifySupportVisitor example
					</Link>
				</li>
				<li>
					<Link className="underline" href="/custom-page">
						Support.Page + useSupportNavigation example
					</Link>
				</li>
			</ul>

			<Suspense fallback={null}>
				<LazySupport />
			</Suspense>

			<div className="mt-auto rounded border border-slate-300 border-dashed p-6 text-slate-500 text-sm">
				Scroll target for fixed-position widget tests.
			</div>
		</main>
	);
}
