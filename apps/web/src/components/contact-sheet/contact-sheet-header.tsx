import type { ContactDetailResponse } from "@plasma/types";
import { Avatar } from "@/components/ui/avatar";

type ContactSheetHeaderProps = {
	contact: ContactDetailResponse["contact"];
};

export function ContactSheetHeader({ contact }: ContactSheetHeaderProps) {
	const displayName = contact.name ?? contact.email ?? "Contact";

	return (
		<div className="flex h-10 w-full items-center justify-between px-2">
			<div className="flex items-center gap-3">
				<Avatar
					fallbackName={displayName}
					lastOnlineAt={null}
					url={contact.image}
				/>
				<div className="flex flex-col gap-0">
					<p className="font-medium text-sm">{displayName}</p>
					{contact.email ? (
						<p className="text-muted-foreground text-xs">{contact.email}</p>
					) : (
						<p className="text-primary/50 text-xs">No email</p>
					)}
				</div>
			</div>
		</div>
	);
}
