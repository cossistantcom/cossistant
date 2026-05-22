import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getTweet } from "react-tweet/api";

type XEmbedProps = {
	id: string;
};

function TweetFallback({ id }: { id: string }) {
	return (
		<Link
			className="block text-muted-foreground text-sm transition-colors hover:text-foreground"
			href={`https://x.com/i/status/${id}`}
			rel="noopener noreferrer"
			target="_blank"
		>
			View this post on X
		</Link>
	);
}

async function TweetContent({ id }: { id: string }) {
	let tweet: Awaited<ReturnType<typeof getTweet>>;

	try {
		tweet = await getTweet(id);
	} catch {
		return <TweetFallback id={id} />;
	}

	if (!tweet) {
		return <TweetFallback id={id} />;
	}

	return (
		<Link
			className="group block"
			href={`https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div className="flex gap-3">
				<Image
					alt={tweet.user.name}
					className="size-10 rounded-full"
					height={40}
					src={tweet.user.profile_image_url_https}
					width={40}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-sm">{tweet.user.name}</span>
						<span className="text-muted-foreground text-sm">
							@{tweet.user.screen_name}
						</span>
					</div>
				</div>
			</div>
			<p className="mt-10 whitespace-pre-wrap text-pretty text-primary/90">
				{tweet.text}
			</p>
		</Link>
	);
}

export function XEmbed({ id }: XEmbedProps) {
	return (
		<div className="not-prose relative my-8 rounded border bg-background p-4 transition-colors hover:bg-background-100">
			<svg
				aria-hidden="true"
				className="absolute top-4 right-4 size-4 text-muted-foreground"
				fill="currentColor"
				viewBox="0 0 1200 1227"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
			</svg>
			<Suspense
				fallback={
					<div className="flex gap-3">
						<div className="size-10 animate-pulse rounded-full bg-background-300" />
						<div className="flex-1 space-y-2">
							<div className="h-4 w-32 animate-pulse rounded bg-background-300" />
							<div className="h-4 w-full animate-pulse rounded bg-background-300" />
						</div>
					</div>
				}
			>
				<TweetContent id={id} />
			</Suspense>
		</div>
	);
}
