"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const MARKDOWN = `You are helping implement Facehash avatars in a React/Next.js project.

## What is Facehash?
A React component that generates unique, deterministic avatar faces from any string (emails, usernames, UUIDs). Zero dependencies, works offline, accessible by default.

Key behavior: same input = same face, always. No API calls, no storage, no randomness.

## Installation
\`\`\`bash
npm install facehash
\`\`\`

## Basic Usage
\`\`\`tsx
import { Facehash } from "facehash";

// Pass any string - emails, usernames, IDs all work
<Facehash name="user@example.com" size={48} />
\`\`\`

## Available Props
- \`name\` (string, required): Input string that determines the face
- \`size\` (number, default: 40): Avatar size in pixels
- \`colors\` (string[]): Custom color palette, e.g. \`["#264653", "#2a9d8f", "#e9c46a"]\`
- \`intensity3d\` ("none" | "subtle" | "medium" | "dramatic"): 3D effect intensity, default "dramatic"
- \`showInitial\` (boolean, default: true): Show first letter on face
- \`variant\` ("gradient" | "solid"): Background style, default "gradient"
- \`enableBlink\` (boolean): Enable blinking animation
- \`onRenderMouth\` (() => ReactNode): Custom mouth renderer (e.g., for loading spinners)
- \`className\` (string): CSS classes - controls face color via \`text-*\` and font styles

## Next.js Image Route Handler
For generating avatar URLs (useful for emails, OG images, external services):

\`\`\`ts
// app/api/avatar/route.ts
import { toFacehashHandler } from "facehash/next";

export const { GET } = toFacehashHandler();
\`\`\`

Then use as: \`<img src="/api/avatar?name=john" />\` or \`https://yoursite.com/api/avatar?name=john\`

## Avatar with Image Fallback
When you need to show a user photo with Facehash as fallback:

\`\`\`tsx
import { Avatar, AvatarImage, AvatarFallback } from "facehash";

<Avatar>
  <AvatarImage src={user.photoUrl} />
  <AvatarFallback name={user.email} />
</Avatar>
\`\`\`

## Implementation Guidelines
1. Replace existing avatar placeholders or boring initials with Facehash
2. Use the user's email, username, or ID as the \`name\` prop for consistency
3. Match the \`size\` prop to the existing avatar dimensions
4. For dark backgrounds, add \`className="text-white"\` for better contrast
5. If the project uses Next.js and needs avatar URLs, add the route handler
`;

export function CopyAiPromptButton() {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(MARKDOWN);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			className="inline-flex items-center gap-2 px-2 py-1 text-[var(--muted-foreground)] text-xs transition-colors hover:bg-[var(--border)] hover:text-[var(--foreground)]"
			onClick={handleCopy}
			title="Copy AI prompt"
			type="button"
		>
			{copied ? (
				<Check className="h-3.5 w-3.5 text-green-500" />
			) : (
				<Copy className="h-3.5 w-3.5" />
			)}
			<span>copy ai prompt</span>
		</button>
	);
}
