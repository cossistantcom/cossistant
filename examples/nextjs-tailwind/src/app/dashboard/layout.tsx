import { IdentifySupportVisitor } from "@cossistant/next/identify-visitor";
import { getMockSession } from "@/lib/mock-auth";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getMockSession();

	return (
		<div>
			{session?.user && (
				<IdentifySupportVisitor
					email={session.user.email}
					externalId={session.user.id}
					image={session.user.image}
					metadata={{
						plan: session.user.plan,
						signupDate: session.user.createdAt,
					}}
					name={session.user.name}
				/>
			)}
			{children}
		</div>
	);
}
