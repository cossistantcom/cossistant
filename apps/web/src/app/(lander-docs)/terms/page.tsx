import Link from "next/link";
import { marketing } from "@/lib/metadata";
import { LegalPageLayout } from "../components/legal-page-layout";

export const metadata = marketing({
	title: "Terms of Service",
	description:
		"Terms and conditions for using Cossistant's support infrastructure platform.",
	path: "/terms",
});

const sections = [
	{
		title: "Acceptance of Terms",
		content: (
			<p>
				By accessing or using Cossistant ("the Service"), operated by
				Productized Inc. ("we," "us," or "our"), you agree to be bound by these
				Terms of Service. If you do not agree to these terms, please do not use
				the Service.
			</p>
		),
	},
	{
		title: "Description of Service",
		content: (
			<p>
				Cossistant is an open-source, AI-native support infrastructure for
				modern SaaS applications. We provide a chat support widget, dashboard,
				and related tools to help you manage customer support. The Service
				includes both hosted (cloud) and self-hosted options.
			</p>
		),
	},
	{
		title: "Account Registration",
		content: (
			<>
				<p>
					To use certain features of the Service, you must create an account.
					You agree to:
				</p>
				<ul className="mt-2 list-disc space-y-2 pl-6">
					<li>
						Provide accurate, current, and complete information during
						registration.
					</li>
					<li>Maintain and promptly update your account information.</li>
					<li>Maintain the confidentiality of your account credentials.</li>
					<li>
						Accept responsibility for all activities that occur under your
						account.
					</li>
				</ul>
				<p className="mt-4">
					You are solely responsible for maintaining the confidentiality of your
					account credentials and for any activities that occur under your
					account.
				</p>
			</>
		),
	},
	{
		title: "User Conduct",
		content: (
			<>
				<p>You agree not to:</p>
				<ul className="mt-2 list-disc space-y-2 pl-6">
					<li>
						Transmit unlawful, harmful, threatening, abusive, or otherwise
						objectionable content.
					</li>
					<li>
						Attempt to gain unauthorized access to our systems or other users'
						accounts.
					</li>
					<li>
						Use automated scripts, bots, or other means to access the Service
						without our express authorization.
					</li>
					<li>
						Interfere with or disrupt the Service or servers connected to the
						Service.
					</li>
					<li>
						Use the Service for any illegal purpose or in violation of any
						applicable laws.
					</li>
					<li>
						Impersonate any person or entity or misrepresent your affiliation.
					</li>
				</ul>
			</>
		),
	},
	{
		title: "Intellectual Property",
		content: (
			<>
				<p>
					Cossistant is open source software licensed under the GPL-3.0 license.
					The source code is available at{" "}
					<a
						className="text-primary underline"
						href="https://github.com/plasma-pandora/plasma-pandora"
						rel="noopener noreferrer"
						target="_blank"
					>
						github.com/plasma-pandora/plasma-pandora
					</a>
					.
				</p>
				<p className="mt-4">
					The Cossistant name, logo, and branding are trademarks of Productized
					Inc. You may not use our trademarks without our prior written consent,
					except as permitted by the open source license for the software
					itself.
				</p>
			</>
		),
	},
	{
		title: "Your Content",
		content: (
			<>
				<p>
					You retain ownership of any content you submit through the Service. By
					using the Service, you grant us a limited license to store, process,
					and display your content as necessary to provide the Service.
				</p>
				<p className="mt-4">
					You are responsible for ensuring that your content does not violate
					any third-party rights or applicable laws.
				</p>
			</>
		),
	},
	{
		title: "Privacy",
		content: (
			<p>
				Your use of the Service is also governed by our{" "}
				<Link className="text-primary underline" href="/privacy">
					Privacy Policy
				</Link>
				, which describes how we collect, use, and protect your personal
				information. By using the Service, you consent to the data practices
				described in our Privacy Policy.
			</p>
		),
	},
	{
		title: "Payments and Billing",
		content: (
			<>
				<p>
					Certain features of the Service require a paid subscription. Payment
					is processed through our third-party payment processor, Polar.sh. We
					do not store your payment information directly.
				</p>
				<p className="mt-4">
					Subscriptions are billed monthly. You may cancel your subscription at
					any time, and your access will continue until the end of your current
					billing period. Refunds are handled on a case-by-case basis.
				</p>
			</>
		),
	},
	{
		title: "Service Availability",
		content: (
			<p>
				We strive to maintain high availability of the Service but do not
				guarantee uninterrupted access. The Service may be temporarily
				unavailable due to maintenance, updates, or circumstances beyond our
				control. We reserve the right to modify or discontinue any part of the
				Service at any time.
			</p>
		),
	},
	{
		title: "Limitation of Liability",
		content: (
			<>
				<p>
					To the maximum extent permitted by law, Productized Inc. shall not be
					liable for any indirect, incidental, special, consequential, or
					punitive damages arising out of or in connection with your use of the
					Service.
				</p>
				<p className="mt-4">
					Our total liability for any claims arising from your use of the
					Service shall not exceed the amount you paid us in the twelve (12)
					months preceding the claim.
				</p>
			</>
		),
	},
	{
		title: "Disclaimer of Warranties",
		content: (
			<p>
				The Service is provided "as is" and "as available" without warranties of
				any kind, either express or implied, including but not limited to
				implied warranties of merchantability, fitness for a particular purpose,
				and non-infringement.
			</p>
		),
	},
	{
		title: "Termination",
		content: (
			<p>
				We may suspend or terminate your access to the Service at any time, with
				or without cause, and with or without notice. Upon termination, your
				right to use the Service will immediately cease. Provisions of these
				Terms that by their nature should survive termination shall survive.
			</p>
		),
	},
	{
		title: "Governing Law and Jurisdiction",
		content: (
			<p>
				These Terms shall be governed by and construed in accordance with the
				laws of the State of Delaware, United States, without regard to its
				conflict of law provisions. Any disputes arising from these Terms or
				your use of the Service shall be subject to the exclusive jurisdiction
				of the courts located in Delaware, United States.
			</p>
		),
	},
	{
		title: "Severability",
		content: (
			<p>
				If any provision of these Terms is found to be invalid or unenforceable,
				that provision shall be limited or eliminated to the minimum extent
				necessary, and the remaining provisions shall remain in full force and
				effect.
			</p>
		),
	},
	{
		title: "Entire Agreement",
		content: (
			<p>
				These Terms, together with our Privacy Policy, constitute the entire
				agreement between you and Productized Inc. regarding your use of the
				Service and supersede all prior agreements and understandings.
			</p>
		),
	},
	{
		title: "Changes to These Terms",
		content: (
			<p>
				We may update these Terms from time to time. We will notify you of any
				material changes by posting the new Terms on this page and updating the
				effective date. Your continued use of the Service after such changes
				constitutes your acceptance of the new Terms.
			</p>
		),
	},
	{
		title: "Contact Us",
		content: (
			<>
				<p>If you have any questions about these Terms, please contact us:</p>
				<ul className="mt-2 space-y-1">
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

export default function TermsPage() {
	return (
		<LegalPageLayout
			effectiveDate="February 4, 2026"
			sections={sections}
			title="Terms of Service"
		/>
	);
}
