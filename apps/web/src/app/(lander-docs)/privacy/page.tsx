import Link from "next/link";
import { marketing } from "@/lib/metadata";
import { LegalPageLayout } from "../components/legal-page-layout";

export const metadata = marketing({
	title: "Privacy Policy",
	description:
		"Learn how Cossistant collects, uses, and protects your personal information.",
	path: "/privacy",
});

const sections = [
	{
		title: "Introduction",
		content: (
			<p>
				Productized Inc. ("we," "us," or "our") operates Cossistant, an
				open-source, AI-native support infrastructure for modern SaaS. This
				Privacy Policy explains how we collect, use, and protect your personal
				information when you use our platform.
			</p>
		),
	},
	{
		title: "Information We Collect",
		content: (
			<>
				<p>We collect the following types of information:</p>
				<ul className="mt-2 list-disc space-y-2 pl-6">
					<li>
						<strong>Account Information:</strong> Name and email address for
						account creation and personalization.
					</li>
					<li>
						<strong>Authentication Data:</strong> Session cookies for secure
						authentication only.
					</li>
					<li>
						<strong>Usage Logs:</strong> Basic usage information including login
						timestamps and user actions to improve our service.
					</li>
					<li>
						<strong>Support Content:</strong> Messages, files, and other content
						you share through the support widget.
					</li>
				</ul>
			</>
		),
	},
	{
		title: "Information We Do Not Collect",
		content: (
			<p>
				We do not collect sensitive categories of data such as health
				information, biometric data, or government identifiers. We do not store
				your payment information directly—all payment processing is handled
				securely by our payment processor, Polar.sh.
			</p>
		),
	},
	{
		title: "Legal Basis for Processing (GDPR)",
		content: (
			<>
				<p>We process your data under the following legal bases:</p>
				<ul className="mt-2 list-disc space-y-2 pl-6">
					<li>
						<strong>Contract Performance:</strong> Processing your name and
						email is necessary to provide you with our services.
					</li>
					<li>
						<strong>Legitimate Interests:</strong> We collect log data to ensure
						the security and performance of our platform.
					</li>
					<li>
						<strong>Consent:</strong> We will obtain your explicit consent
						before sending any marketing communications.
					</li>
				</ul>
			</>
		),
	},
	{
		title: "Data Storage and Security",
		content: (
			<>
				<p>
					Your data is primarily stored in the United States. We implement
					industry-standard security measures including:
				</p>
				<ul className="mt-2 list-disc space-y-2 pl-6">
					<li>Encryption in transit using HTTPS/SSL</li>
					<li>Encryption at rest for stored data</li>
					<li>Role-based access controls</li>
					<li>Regular security audits</li>
				</ul>
			</>
		),
	},
	{
		title: "Third-Party Services",
		content: (
			<p>
				We use carefully vetted third-party services to operate our platform.
				All partners operate under GDPR-compliant agreements. For a complete
				list of services we use, see our{" "}
				<Link
					className="text-primary underline"
					href="/docs/others/third-party-services"
				>
					Third-Party Services
				</Link>{" "}
				documentation.
			</p>
		),
	},
	{
		title: "Data Retention",
		content: (
			<p>
				We retain your account data while your account is active. Upon account
				closure, your data will be deleted within one year or immediately upon
				your request. Anonymized and aggregated data may be retained
				indefinitely for analytics purposes.
			</p>
		),
	},
	{
		title: "Your Rights (EEA Residents)",
		content: (
			<>
				<p>
					If you are located in the European Economic Area, you have the
					following rights under GDPR:
				</p>
				<ul className="mt-2 list-disc space-y-2 pl-6">
					<li>
						<strong>Access:</strong> Request a copy of your personal data.
					</li>
					<li>
						<strong>Rectification:</strong> Request correction of inaccurate
						data.
					</li>
					<li>
						<strong>Erasure:</strong> Request deletion of your personal data.
					</li>
					<li>
						<strong>Restriction:</strong> Request limitation of processing.
					</li>
					<li>
						<strong>Portability:</strong> Request transfer of your data to
						another service.
					</li>
					<li>
						<strong>Objection:</strong> Object to certain types of processing.
					</li>
				</ul>
				<p className="mt-4">
					You may also lodge a complaint with your local Data Protection
					Authority.
				</p>
			</>
		),
	},
	{
		title: "Cookies",
		content: (
			<p>
				We use only essential session cookies required for authentication. We do
				not use tracking cookies or third-party advertising cookies. Our
				analytics are privacy-friendly and do not track individual users.
			</p>
		),
	},
	{
		title: "Children's Privacy",
		content: (
			<p>
				Our service is not directed to children under 16. We do not knowingly
				collect personal information from children. If you believe we have
				collected information from a child, please contact us immediately.
			</p>
		),
	},
	{
		title: "Changes to This Policy",
		content: (
			<p>
				We may update this Privacy Policy from time to time. We will notify you
				of any material changes by posting the new policy on this page and
				updating the effective date. We encourage you to review this policy
				periodically.
			</p>
		),
	},
	{
		title: "Contact Us",
		content: (
			<>
				<p>
					If you have any questions about this Privacy Policy or our data
					practices, please contact us:
				</p>
				<ul className="mt-2 space-y-1">
					<li>
						<strong>Data Protection Officer:</strong> Anthony Riera (CEO)
					</li>
					<li>
						<strong>Email:</strong>{" "}
						<a
							className="text-primary underline"
							href="mailto:anthony@plasma-pandora.com"
						>
							anthony@plasma-pandora.com
						</a>
					</li>
					<li>
						<strong>Address:</strong> 1007 N Orange St., 4th Floor, Wilmington,
						DE 19801, USA
					</li>
				</ul>
			</>
		),
	},
];

export default function PrivacyPage() {
	return (
		<LegalPageLayout
			effectiveDate="February 4, 2026"
			sections={sections}
			title="Privacy Policy"
		/>
	);
}
