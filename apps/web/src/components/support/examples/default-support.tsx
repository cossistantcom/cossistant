import { Support } from "@cossistant/react/support";

export default function ExampleSupportWidget() {
	return (
		<Support
			quickOptions={[
				"How do I add the widget?",
				"Can I customize the home page?",
				"How do slots work?",
			]}
		/>
	);
}
