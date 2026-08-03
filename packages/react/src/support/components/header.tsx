import { useSupportSlotOverrides } from "../context/slot-overrides";
import { useSupportConfig } from "../store";
import { useSupportTextSafe } from "../text";
import { cn } from "../utils";
import { CoButton } from "./button";
import Icon from "./icons";

export type HeaderProps = {
	className?: string;
	children?: React.ReactNode;
	actions?: React.ReactNode;
	onGoBack?: () => void;
	page?: string;
};

export const Header: React.FC<HeaderProps> = ({
	className,
	children,
	actions,
	onGoBack,
	page,
}) => {
	const { close } = useSupportConfig();
	const text = useSupportTextSafe();
	const { slots, slotProps } = useSupportSlotOverrides();
	const HeaderSlot = slots.header;
	const headerSlotProps = slotProps.header;

	if (HeaderSlot) {
		return (
			<HeaderSlot
				{...headerSlotProps}
				actions={actions}
				className={cn(headerSlotProps?.className, className)}
				data-page={page}
				data-slot="header"
				onGoBack={onGoBack}
				page={page}
			>
				{children}
			</HeaderSlot>
		);
	}

	return (
		<div
			className={cn("absolute inset-x-0 top-0 z-10 h-18", className)}
			data-page={page}
			data-slot="header"
		>
			<div className="absolute inset-0 z-10 flex items-center justify-between gap-3 px-4">
				<div className="flex flex-1 items-center gap-3">
					{onGoBack && (
						<CoButton
							aria-label={text("common.actions.goBack")}
							onClick={onGoBack}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Icon name="arrow-left" />
						</CoButton>
					)}
					{children}
				</div>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
				<CoButton
					aria-label={text("common.actions.close")}
					onClick={close}
					size="icon"
					type="button"
					variant="ghost"
				>
					<Icon name="close" />
				</CoButton>
			</div>
		</div>
	);
};
