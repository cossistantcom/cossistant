import {
	WebsiteInstallationTarget,
	type WebsiteInstallationTarget as WebsiteInstallationTargetValue,
} from "@plasma/types";

export type SupportIntegrationFramework = "nextjs" | "react";
export type SupportPackageManager = "bun" | "npm" | "pnpm" | "yarn";
type SupportPackageName = "@plasma/next" | "@plasma/react";

function getSupportPackageSpecifier(
	packageName: SupportPackageName,
	version?: string
): string {
	if (!version) {
		return packageName;
	}

	return `${packageName}@${version}`;
}

function buildSupportInstallCommands(
	packageName: SupportPackageName,
	version?: string
): Record<SupportPackageManager, string> {
	const packageSpecifier = getSupportPackageSpecifier(packageName, version);

	return {
		bun: `bun add ${packageSpecifier}`,
		npm: `npm install ${packageSpecifier}`,
		pnpm: `pnpm add ${packageSpecifier}`,
		yarn: `yarn add ${packageSpecifier}`,
	};
}

const INSTALL_COMMANDS: Record<
	SupportIntegrationFramework,
	Record<SupportPackageManager, string>
> = {
	nextjs: buildSupportInstallCommands("@plasma/next"),
	react: buildSupportInstallCommands("@plasma/react"),
};

export type SupportIntegrationGuide = {
	framework: SupportIntegrationFramework;
	frameworkLabel: string;
	packageName: "@plasma/next" | "@plasma/react";
	envVarName: string;
	envFileName: ".env.local" | ".env";
	docsQuickstartPath: "/docs/quickstart" | "/docs/quickstart/react";
	providerCode: string;
	providerFileName: string;
	widgetCode: string;
	widgetFileName: string;
	identifyVisitorCode: string;
	identifyVisitorFileName: string;
	defaultMessageCode: string;
	defaultMessageFileName: string;
	cssTailwindCode: string;
	cssTailwindFileName: string;
	cssPlainCode: string;
	cssPlainFileName: string;
};

const SUPPORT_GUIDES: Record<
	SupportIntegrationFramework,
	SupportIntegrationGuide
> = {
	nextjs: {
		framework: "nextjs",
		frameworkLabel: "Next.js",
		packageName: "@plasma/next",
		envVarName: "NEXT_PUBLIC_COSSISTANT_API_KEY",
		envFileName: ".env.local",
		docsQuickstartPath: "/docs/quickstart",
		providerFileName: "app/layout.tsx",
		providerCode: `import { SupportProvider } from "@plasma/next";

import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SupportProvider>{children}</SupportProvider>
      </body>
    </html>
  );
}
`,
		widgetFileName: "app/page.tsx",
		widgetCode: `import { Support } from "@plasma/next";

export default function Page() {
  return (
    <main>
      <h1>You are ready to chat</h1>
      <Support />
    </main>
  );
}
`,
		identifyVisitorFileName: "app/(app)/layout.tsx",
		identifyVisitorCode: `import { IdentifySupportVisitor } from "@plasma/next";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = {
    id: "user_123",
    email: "jane@acme.com",
    name: "Jane Doe",
  };

  return (
    <>
      <IdentifySupportVisitor
        externalId={user.id}
        email={user.email}
        name={user.name}
      />
      {children}
    </>
  );
}
`,
		defaultMessageFileName: "app/page.tsx",
		defaultMessageCode: `import { Support, SupportConfig } from "@plasma/next";
import { type DefaultMessage, SenderType } from "@plasma/types";

const user: { name: string | null } = {
  name: "Jane Doe",
};

const defaultMessages: DefaultMessage[] = [
  {
    content: \`Hi \${user.name ?? "there"}, anything I can help with?\`,
    senderType: SenderType.TEAM_MEMBER,
  },
];

const quickOptions: string[] = ["How to identify a visitor?"];

export default function Page() {
  return (
    <>
      <SupportConfig
        defaultMessages={defaultMessages}
        quickOptions={quickOptions}
      />
      <Support />
    </>
  );
}
`,
		cssTailwindFileName: "app/globals.css",
		cssTailwindCode: `@import "tailwindcss";

@import "@plasma/next/support.css";
`,
		cssPlainFileName: "app/layout.tsx",
		cssPlainCode: `import { SupportProvider } from "@plasma/next";
import "@plasma/next/styles.css";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SupportProvider>{children}</SupportProvider>
      </body>
    </html>
  );
}
`,
	},
	react: {
		framework: "react",
		frameworkLabel: "React",
		packageName: "@plasma/react",
		envVarName: "COSSISTANT_API_KEY",
		envFileName: ".env",
		docsQuickstartPath: "/docs/quickstart/react",
		providerFileName: "src/main.tsx",
		providerCode: `import React from "react";
import ReactDOM from "react-dom/client";
import { SupportProvider } from "@plasma/react";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SupportProvider publicKey={process.env.COSSISTANT_API_KEY}>
      <App />
    </SupportProvider>
  </React.StrictMode>
);
`,
		widgetFileName: "src/App.tsx",
		widgetCode: `import { Support } from "@plasma/react";

export default function App() {
  return (
    <main>
      <h1>You are ready to chat</h1>
      <Support />
    </main>
  );
}
`,
		identifyVisitorFileName: "src/App.tsx",
		identifyVisitorCode: `import { IdentifySupportVisitor, Support } from "@plasma/react";

export default function App() {
  const user = {
    id: "user_123",
    email: "jane@acme.com",
    name: "Jane Doe",
  };

  return (
    <>
      <IdentifySupportVisitor
        externalId={user.id}
        email={user.email}
        name={user.name}
      />
      <Support />
    </>
  );
}
`,
		defaultMessageFileName: "src/App.tsx",
		defaultMessageCode: `import { Support, SupportConfig } from "@plasma/react";
import { type DefaultMessage, SenderType } from "@plasma/types";

const user: { name: string | null } = {
  name: "Jane Doe",
};

const defaultMessages: DefaultMessage[] = [
  {
    content: \`Hi \${user.name ?? "there"}, anything I can help with?\`,
    senderType: SenderType.TEAM_MEMBER,
  },
];

const quickOptions: string[] = ["How to identify a visitor?"];

export default function App() {
  return (
    <>
      <SupportConfig
        defaultMessages={defaultMessages}
        quickOptions={quickOptions}
      />
      <Support />
    </>
  );
}
`,
		cssTailwindFileName: "src/index.css",
		cssTailwindCode: `@import "tailwindcss";

@import "@plasma/react/support.css";
`,
		cssPlainFileName: "src/main.tsx",
		cssPlainCode: `import React from "react";
import ReactDOM from "react-dom/client";
import { SupportProvider } from "@plasma/react";
import "@plasma/react/styles.css";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SupportProvider publicKey={process.env.COSSISTANT_API_KEY}>
      <App />
    </SupportProvider>
  </React.StrictMode>
);
`,
	},
};

export function resolveSupportIntegrationFramework(
	installationTarget: WebsiteInstallationTargetValue | string | undefined
): SupportIntegrationFramework {
	if (installationTarget === WebsiteInstallationTarget.REACT) {
		return "react";
	}

	return "nextjs";
}

export function getSupportIntegrationGuide(
	installationTarget: WebsiteInstallationTargetValue | string | undefined
): SupportIntegrationGuide {
	const framework = resolveSupportIntegrationFramework(installationTarget);
	return SUPPORT_GUIDES[framework];
}

export function getSupportInstallCommands(
	installationTarget: WebsiteInstallationTargetValue | string | undefined,
	version?: string
): Record<SupportPackageManager, string> {
	const framework = resolveSupportIntegrationFramework(installationTarget);

	if (!version) {
		return INSTALL_COMMANDS[framework];
	}

	return buildSupportInstallCommands(
		SUPPORT_GUIDES[framework].packageName,
		version
	);
}

export function getSupportInstallCommand({
	installationTarget,
	packageManager,
	version,
}: {
	installationTarget: WebsiteInstallationTargetValue | string | undefined;
	packageManager: string | undefined;
	version?: string;
}): string {
	const commands = getSupportInstallCommands(installationTarget, version);

	if (!packageManager) {
		return commands.pnpm;
	}

	return commands[packageManager as SupportPackageManager] ?? commands.pnpm;
}

export function buildSupportAiSetupPrompt({
	installationTarget,
	installCommand,
	websiteName,
	websiteDomain,
	publicApiKey,
}: {
	installationTarget: WebsiteInstallationTargetValue | string | undefined;
	installCommand: string;
	websiteName: string;
	websiteDomain: string;
	publicApiKey?: string | null;
}): string {
	const guide = getSupportIntegrationGuide(installationTarget);
	const otherPackage =
		guide.packageName === "@plasma/next"
			? "@plasma/react"
			: "@plasma/next";
	const keyValue = publicApiKey ?? "pk_test_replace_me";

	const keyInstruction = publicApiKey
		? `Use this exact public key value: ${publicApiKey}`
		: "If the public key is missing, fetch it from Cossistant dashboard > Settings > Developers and replace the placeholder value.";

	return `You are a senior ${guide.frameworkLabel} engineer. Integrate Cossistant into an existing ${guide.frameworkLabel} project.

Project context:
- Website name: ${websiteName}
- Website domain: ${websiteDomain}
- Framework: ${guide.frameworkLabel}
- Package: ${guide.packageName}
- Install command: ${installCommand}

Hard constraints:
1. Install only "${guide.packageName}".
2. Do not install "${otherPackage}".
3. Keep changes scoped to Cossistant integration only.
4. Preserve the project's coding style and existing architecture.

Required implementation:
1. Install dependency:
   ${installCommand}
2. Add/update ${guide.envFileName} with:
   ${guide.envVarName}=${keyValue}
3. ${keyInstruction}
4. Mount <SupportProvider> at the app root.
5. Import widget CSS:
   - If global CSS already contains '@import "tailwindcss";', add '@import "${guide.packageName}/support.css";'
   - Otherwise import '${guide.packageName}/styles.css' in the root entry/layout file.
6. Render <Support /> in a real page.
7. Add optional visitor identification for logged-in users using <IdentifySupportVisitor />.
8. Add custom welcome messages using <SupportConfig defaultMessages={defaultMessages} quickOptions={quickOptions} /> with typed DefaultMessage[] and SenderType values.

Output format (strict):
1. List all changed files.
2. For each file, provide final code (full file content for touched files).
3. Provide commands to run after applying changes.
4. Provide a short verification checklist:
   - provider mounted
   - widget renders
   - API key loaded
   - visitor identification works (if user session exists)
   - default messages render
5. Call out assumptions clearly.`;
}
