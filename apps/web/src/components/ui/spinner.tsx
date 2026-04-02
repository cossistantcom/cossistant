import {
	Spinner as SharedSpinner,
	type SpinnerProps as SharedSpinnerProps,
} from "@plasma/react/support/components";

export type SpinnerProps = SharedSpinnerProps & {
	className?: string;
	size?: number;
	squaresPerSide?: number;
	squareSize?: number;
	trailLength?: number;
};

export const Spinner = ({
	className,
	size = 16,
	variant = "auto",
}: SpinnerProps) => (
	<SharedSpinner className={className} size={size} variant={variant} />
);
