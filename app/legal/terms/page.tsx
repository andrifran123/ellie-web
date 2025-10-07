// app/legal/terms/page.tsx
export const metadata = { title: "Terms of Service — Ellie" };

export default function TermsPage() {
  return (
    <main className="px-6 md:px-10 py-10 max-w-3xl mx-auto text-white">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-white/60">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mt-6 space-y-4 text-white/90 leading-7">
        <p>
          By using Ellie, you agree to these Terms. If you don’t agree, don’t use the service.
        </p>

        <h2 className="text-xl font-semibold">Accounts</h2>
        <p>
          Keep your account secure. You’re responsible for activity under your account. You must be legally
          allowed to use the service in your country.
        </p>

        <h2 className="text-xl font-semibold">Subscriptions & billing</h2>
        <p>
          Paid plans renew automatically until canceled. Prices, features, and taxes may change. Our payment
          processor (e.g., Stripe) handles payments. Refunds are handled case-by-case.
        </p>

        <h2 className="text-xl font-semibold">Acceptable use</h2>
        <p>
          Don’t abuse, reverse engineer, or use the service for unlawful purposes. We may suspend or terminate
          accounts that violate these Terms.
        </p>

        <h2 className="text-xl font-semibold">Content</h2>
        <p>
          You’re responsible for what you submit. You grant us the rights needed to operate and improve the
          service (e.g., processing your messages to respond).
        </p>

        <h2 className="text-xl font-semibold">Disclaimer & limitation of liability</h2>
        <p>
          The service is provided “as is” without warranties. To the maximum extent permitted by law, we’re
          not liable for indirect or consequential damages.
        </p>

        <h2 className="text-xl font-semibold">Changes</h2>
        <p>
          We may update these Terms. If changes are material, we’ll provide notice. Continued use means you
          accept the new Terms.
        </p>

        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Email <a className="underline" href="mailto:support@ellie-elite.com">support@ellie-elite.com</a>.
        </p>
      </section>
    </main>
  );
}
