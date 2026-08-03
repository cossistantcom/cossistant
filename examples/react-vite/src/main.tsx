import { SupportProvider } from "@cossistant/react/provider";
import * as React from "react";
import { createRoot } from "react-dom/client";
import "@cossistant/react/styles.css";
import "./styles.css";
import { App } from "./app";
import { createMockSupportController } from "./mock-support-controller";

function ExampleSupportProvider({ children }: { children: React.ReactNode }) {
	const publicKey = import.meta.env.VITE_COSSISTANT_API_KEY;
	const controller = React.useMemo(
		() => (publicKey ? undefined : createMockSupportController()),
		[publicKey]
	);

	if (publicKey) {
		return <SupportProvider publicKey={publicKey}>{children}</SupportProvider>;
	}

	return (
		<SupportProvider autoConnect={false} controller={controller}>
			{children}
		</SupportProvider>
	);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Missing root element");
}

createRoot(rootElement).render(
	<React.StrictMode>
		<ExampleSupportProvider>
			<App />
		</ExampleSupportProvider>
	</React.StrictMode>
);
