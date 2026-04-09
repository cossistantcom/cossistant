import { resendTransport } from "../providers/resend/transport";
import { sesTransport } from "../providers/ses/transport";
import { getEmailTransportProvider } from "./config";

export function getMailTransport() {
	return getEmailTransportProvider() === "ses" ? sesTransport : resendTransport;
}
