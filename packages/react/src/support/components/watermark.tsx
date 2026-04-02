import { useSupport } from "@plasma/react";
import { useMemo } from "react";
import { Text } from "../text";
import { cn } from "../utils";
import { PlasmaLogo } from "./plasma-branding";

export type WatermarkProps = {
	className?: string;
};

export const Watermark: React.FC<WatermarkProps> = ({ className }) => {
	const { website } = useSupport();

	const cossistantUrl = useMemo(() => {
		if (!website) {
			return "https://plasma-pandora.com";
		}

		const url = new URL("https://plasma-pandora.com");

		url.searchParams.set("ref", "chatbox");
		url.searchParams.set("domain", website.domain);
		url.searchParams.set("name", website.name);

		return url.toString();
	}, [website]);

	return (
		<a
			className={cn(
				"group/watermark flex items-center gap-1.5 font-medium text-co-primary/80 hover:text-co-blue",
				className
			)}
			href={cossistantUrl}
			rel="noopener noreferrer"
			target="_blank"
		>
			<Text
				as="span"
				className="text-co-muted-foreground text-xs"
				textKey="common.brand.watermark"
			/>
			<PlasmaLogo className="h-3 transition-transform duration-200 group-focus-within/watermark:rotate-5 group-hover/watermark:scale-105" />
		</a>
	);
};
