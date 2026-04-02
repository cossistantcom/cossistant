/**
 * @plasma/transactional
 * Centralized email and transactional communication package
 *
 * This package provides:
 * - Email sending via Resend
 * - Email templates using React Email
 * - Audience management
 * - Subscribe/unsubscribe functionality
 */

// Constants (logos, avatars, etc.)
export * from "./constants";
// Email templates
export * from "./emails/index";
// Resend utilities (client, types, constants, audience management)
export * from "./resend-utils/index";
// Main email sending functions
export { sendBatchEmail, sendEmail } from "./send-via-resend";
