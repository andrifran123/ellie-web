// app/legal/privacy/page.tsx
export const metadata = { title: "Privacy Policy — Ellie" };

export default function PrivacyPage() {
  return (
    <main className="px-6 md:px-10 py-10 max-w-3xl mx-auto text-white">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-white/60">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-4 text-white/90 leading-7">
        <p>
          Ellie (“we”, “us”) provides conversational features and subscriptions. This policy explains what
          we collect, how we use it, and your choices.
        </p>

        <h2 className="text-xl font-semibold">Information we collect</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Account info: email, name (if you sign up with a password flow).</li>
          <li>Session data: authentication cookies, device/browser info.</li>
          <li>Conversation data you send to Ellie to provide the service.</li>
          <li>Billing info is handled by our payment processor (e.g., Stripe). We don’t store card numbers.</li>
        </ul>

        <h2 className="text-xl font-semibold">How we use information</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Authenticate your account and maintain sessions.</li>
          <li>Provide chat/voice features and improve quality.</li>
          <li>Process payments, prevent fraud, and provide support.</li>
        </ul>

        <h2 className="text-xl font-semibold">Sharing</h2>
        <p>
          We share data with service providers only as needed to operate the service (e.g., hosting, email,
          payments). We don’t sell your personal data.
        </p>

        <h2 className="text-xl font-semibold">Retention</h2>
        <p>
          We keep data for as long as necessary to provide the service and comply with legal obligations.
          You can request deletion of your account data by contacting us.
        </p>

        <h2 className="text-xl font-semibold">Your rights</h2>
        <p>
          Subject to applicable law, you may access, correct, or delete your personal data. Contact us to
          exercise these rights.
        </p>

        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Questions? Email us at <a className="underline" href="mailto:support@ellie-elite.com">support@ellie-elite.com</a>.
        </p>
      </section>
    </main>
  );
}
