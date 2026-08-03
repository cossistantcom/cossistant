import { IdentifySupportVisitor } from "@cossistant/react/identify-visitor";
import { Support, useSupportNavigation } from "@cossistant/react/support";
import { SupportConfig } from "@cossistant/react/support-config";
import * as React from "react";

const routes = [
	{ href: "/", label: "Default widget" },
	{ href: "/pricing", label: "Quick options" },
	{ href: "/dashboard", label: "Visitor identity" },
	{ href: "/custom-page", label: "Custom page" },
] as const;

function usePathname() {
	const [pathname, setPathname] = React.useState(window.location.pathname);

	React.useEffect(() => {
		const onPopState = () => {
			setPathname(window.location.pathname);
		};

		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	return [pathname, setPathname] as const;
}

function Navigation({
	onNavigate,
	pathname,
}: {
	onNavigate: (href: string) => void;
	pathname: string;
}) {
	return (
		<nav aria-label="Example routes" className="nav">
			{routes.map((route) => (
				<a
					aria-current={pathname === route.href ? "page" : undefined}
					href={route.href}
					key={route.href}
					onClick={(event) => {
						event.preventDefault();
						onNavigate(route.href);
					}}
				>
					{route.label}
				</a>
			))}
		</nav>
	);
}

function HomePage() {
	return (
		<main className="page page-scroll">
			<h1>React + Vite Integration Example</h1>
			<p>
				This app exercises the plain React package in a real Vite browser
				runtime.
			</p>
			<ul>
				<li>Default fixed bubble positioning</li>
				<li>Desktop and mobile panel bounds</li>
				<li>Custom Support.Page rendering</li>
			</ul>
			<Support />
			<div className="scroll-target">
				Scroll target for fixed-position widget tests.
			</div>
		</main>
	);
}

function PricingPage() {
	return (
		<main className="page">
			<SupportConfig
				quickOptions={[
					"How does billing work?",
					"What's included in Pro?",
					"Can I cancel anytime?",
				]}
			/>
			<h1>Pricing</h1>
			<p>This route validates SupportConfig in a plain React app.</p>
		</main>
	);
}

function DashboardPage() {
	return (
		<main className="page">
			<IdentifySupportVisitor
				email="demo@cossistant.com"
				externalId="user_123"
				metadata={{
					plan: "pro",
					signupDate: "2026-01-01T00:00:00.000Z",
				}}
				name="Demo User"
			/>
			<h1>Dashboard</h1>
			<p>This route validates IdentifySupportVisitor in Vite.</p>
		</main>
	);
}

function HelpPage() {
	const { navigate } = useSupportNavigation();

	return (
		<div className="custom-widget-page">
			<button onClick={() => navigate({ page: "ARTICLES" })} type="button">
				View articles
			</button>
			<h2>Help Center</h2>
			<p>Custom route rendered through Support.Page.</p>
		</div>
	);
}

function CustomPageExample() {
	return (
		<main className="page">
			<h1>Custom Page Example</h1>
			<p>This route replaces the widget home page through Support.Page.</p>
			<Support>
				<Support.Page component={HelpPage} name="HOME" />
			</Support>
		</main>
	);
}

function NotFoundPage() {
	return (
		<main className="page">
			<h1>Not Found</h1>
			<p>Select one of the example routes above.</p>
			<Support />
		</main>
	);
}

export function App() {
	const [pathname, setPathname] = usePathname();

	const navigate = React.useCallback(
		(href: string) => {
			window.history.pushState(null, "", href);
			setPathname(href);
		},
		[setPathname]
	);

	let page = <NotFoundPage />;

	if (pathname === "/") {
		page = <HomePage />;
	} else if (pathname === "/pricing") {
		page = <PricingPage />;
	} else if (pathname === "/dashboard") {
		page = <DashboardPage />;
	} else if (pathname === "/custom-page") {
		page = <CustomPageExample />;
	}

	return (
		<>
			<Navigation onNavigate={navigate} pathname={pathname} />
			{page}
		</>
	);
}
