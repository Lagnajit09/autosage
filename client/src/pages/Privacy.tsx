import { Link } from "react-router-dom";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";

const SUPPORT_EMAIL = "autosagex@gmail.com";
const LAST_UPDATED = "September 30, 2026";

const sections: LegalSection[] = [
  {
    id: "collect",
    title: "Information we collect",
    content: (
      <ul>
        <li>
          <strong>Account details</strong> — your name, email address and
          profile image, provided when you sign up with email, Google or
          GitHub.
        </li>
        <li>
          <strong>Content you create</strong> — workflows, scripts, script
          parameter settings, Autobot conversations and your preferences.
        </li>
        <li>
          <strong>Vault data</strong> — server details and credentials you
          store (such as hostnames, usernames, passwords and SSH keys), and any
          AI provider API keys you add. These are encrypted at rest.
        </li>
        <li>
          <strong>Execution data</strong> — run history, status, exit codes and
          the output (logs) your workflows and scripts produce.
        </li>
        <li>
          <strong>Billing information</strong> — your plan, subscription status
          and payment records. Card and payment details are handled by our
          payment processor, Razorpay; we don't store your full card number.
        </li>
        <li>
          <strong>Messages you send us</strong> — support requests, bug reports
          and enterprise enquiries, including the name and email you provide.
        </li>
        <li>
          <strong>Technical data</strong> — IP address and basic request
          information, used for security and rate limiting.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    content: (
      <>
        <ul>
          <li>
            To provide the Service: signing you in, running your workflows and
            scripts, sending the emails you configure, and showing results.
          </li>
          <li>To process payments and manage your plan and its limits.</li>
          <li>
            To send service emails you've asked for, such as workflow
            completion notifications.
          </li>
          <li>To respond to your support requests and bug reports.</li>
          <li>To keep the Service secure and prevent abuse.</li>
        </ul>
        <p>
          <strong>We don't sell your personal information</strong>, and we
          don't use third-party advertising or analytics trackers.
        </p>
      </>
    ),
  },
  {
    id: "execution",
    title: "Running scripts on your servers",
    content: (
      <p>
        When you run a script or workflow, our execution service retrieves the
        script, decrypts the credentials you selected, and connects to your
        server over SSH or WinRM to run it. The output is streamed back to you
        and stored as execution logs. Password-type parameter values are masked
        in logs.
      </p>
    ),
  },
  {
    id: "ai",
    title: "Autobot and AI providers",
    content: (
      <>
        <p>
          When you use Autobot, your messages and the relevant context (for
          example, the script or workflow you're working on) are sent to an AI
          model provider to generate a response. By default that's one of the
          providers we configure (such as Google Gemini, Groq or OpenRouter);
          if you add your own API key, it's the provider you choose. Those
          providers handle the data under their own terms.
        </p>
        <p>
          Autobot never receives the plaintext values of your vault secrets or
          password parameters — it refers to vault items by ID only, and
          secrets you enter for a run go directly from your browser to our
          servers.
        </p>
        <p>
          The documentation assistant on our docs site doesn't require an
          account. Questions asked there are sent to an AI provider, and the
          conversation is kept only temporarily.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Service providers",
    content: (
      <>
        <p>We rely on these providers to run AutoSage:</p>
        <ul>
          <li><strong>Clerk</strong> — sign-in and account management</li>
          <li><strong>Supabase</strong> — database hosting</li>
          <li>
            <strong>Google Cloud</strong> — storage for scripts and execution
            logs, and the service that runs your scripts
          </li>
          <li><strong>Oracle Cloud</strong> — application servers</li>
          <li><strong>Upstash</strong> — background job queue</li>
          <li><strong>Firebase Hosting</strong> — serving this website</li>
          <li><strong>Razorpay</strong> — payments</li>
          <li><strong>Gmail</strong> — sending service emails</li>
          <li><strong>AI model providers</strong> — Autobot responses (see above)</li>
        </ul>
        <p>
          They process data on our behalf only as needed to provide their
          service to us.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep data",
    content: (
      <ul>
        <li>Account data and content are kept while your account is active.</li>
        <li>
          Execution logs are deleted automatically after about 90 days.
        </li>
        <li>
          Deleting your account from the Profile page permanently deletes your
          workflows, scripts, executions and settings.
        </li>
        <li>
          Payment records held by Razorpay are subject to their own retention
          policies.
        </li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    content: (
      <p>
        Data is encrypted in transit (HTTPS). Vault credentials and API keys are
        encrypted at rest, and every account's data is kept separate from other
        users'. No system is perfectly secure, but we work to protect your
        information and will act promptly on any issue.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    content: (
      <ul>
        <li>
          <strong>Sign-in cookies</strong> set by Clerk keep you signed in.
        </li>
        <li>
          <strong>Your browser's storage</strong> holds preferences and
          work-in-progress on your device — such as your theme, sidebar state,
          open editor tabs, unsaved workflow drafts, and the last page you
          visited (so signing in can bring you back to it).
        </li>
        <li>We don't use advertising or analytics cookies.</li>
      </ul>
    ),
  },
  {
    id: "choices",
    title: "Your choices",
    content: (
      <p>
        You can update your profile, deactivate your account, or delete it at
        any time from your Profile page. To make any other privacy request,
        contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    content: (
      <p>
        AutoSage isn't intended for children, and we don't knowingly collect
        information from them.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    content: (
      <p>
        We may update this policy from time to time. We'll change the "Last
        updated" date above, and for significant changes we'll let you know in
        the app or by email.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <p>
        Questions about your privacy? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or use our{" "}
        <Link to="/contact">contact page</Link>.
      </p>
    ),
  },
];

const Privacy = () => (
  <LegalPage
    title="Privacy Policy"
    lastUpdated={LAST_UPDATED}
    intro={
      <p>
        This policy explains what information AutoSage collects, how we use it,
        and the choices you have. It applies to the AutoSage app, website and
        documentation assistant.
      </p>
    }
    sections={sections}
    related={{ label: "Terms of Service", to: "/terms" }}
  />
);

export default Privacy;
