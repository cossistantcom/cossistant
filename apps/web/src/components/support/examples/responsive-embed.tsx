import { Support } from "@cossistant/react/support";

export default function ExampleResponsiveEmbed() {
	return (
		<div className="h-[560px] overflow-hidden border">
			<Support
				mode="responsive"
				quickOptions={[
					"How do I embed support inline?",
					"Can I keep my own shell?",
					"What can I override with slots?",
				]}
				slotProps={{
					content: {
						className: "bg-background",
					},
				}}
			/>
		</div>
	);
}
