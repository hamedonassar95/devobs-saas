import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { PLAN_CATALOG, type BillingPlan } from "@/lib/billing/plans";
import { getMarketingPrices } from "@/lib/billing/marketing-prices";

export const revalidate = 3600;

const planHighlights: Record<BillingPlan, string[]> = {
  MONITORING: [
    "Monitoring sources and alerts",
    "Organization-scoped operations",
    "14-day trial for first subscriptions",
  ],
  CICD: [
    "CI/CD integrations",
    "Repository connection management",
    "14-day trial for first subscriptions",
  ],
  FULL: [
    "Monitoring and alerts",
    "CI/CD integrations",
    "AI-assisted analysis records",
  ],
};

const features = [
  {
    number: "01",
    icon: "↗",
    title: "CI/CD, connected",
    description:
      "Keep your delivery integrations organized by team, with one place to manage the repositories your organization relies on.",
    tag: "DELIVERY",
  },
  {
    number: "02",
    icon: "◉",
    title: "Monitoring with context",
    description:
      "Bring monitoring sources and alerts into a shared operational picture, so the team can see what needs attention.",
    tag: "OBSERVABILITY",
  },
  {
    number: "03",
    icon: "✳",
    title: "Analysis that stays attached",
    description:
      "Keep investigation summaries alongside the alerts they explain, giving your team a useful record as incidents unfold.",
    tag: "AI-ASSISTED",
  },
];

export default async function HomePage() {
  const prices = await getMarketingPrices();

  return (
    <main className="marketing-site">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <Link className="brand" href="/" aria-label="Devobs home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            devobs<span className="brand-period">.</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#platform">Platform</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="header-actions">
          <Link className="login-link" href="/login">
            Log in
          </Link>
          <Link className="button button-small button-outline" href="/register">
            Get started <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <section className="hero section-shell" id="platform">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="live-dot" /> THE OPERATIONS PLATFORM FOR LEAN TEAMS
          </p>
          <h1>
            Ship with confidence.
            <br />
            <span>Stay in control.</span>
          </h1>
          <p className="hero-description">
            CI/CD, monitoring, and AI-assisted incident analysis in one
            workspace—so your team can spend less time chasing tools and more
            time building.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/register">
              Start your 14-day free trial <span aria-hidden="true">→</span>
            </Link>
            <a className="text-link" href="#platform-tour">
              Explore the platform <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-proof">
            <span className="proof-icon" aria-hidden="true">
              ✓
            </span>{" "}
            14 days on your first subscription{" "}
            <span className="proof-divider" /> Cancel anytime
          </div>
        </div>

        <div
          className="product-window"
          id="platform-tour"
          aria-label="Illustrative Devobs operations overview"
        >
          <div className="window-topbar">
            <div className="window-lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="window-title">
              <span className="mini-mark" /> organization / overview
            </div>
            <span className="window-menu" aria-hidden="true">
              •••
            </span>
          </div>
          <div className="window-body">
            <div className="overview-heading">
              <div>
                <span className="overline">YOUR ORGANIZATION</span>
                <h2>Operational overview</h2>
              </div>
              <span className="workspace-chip">
                <i /> Team workspace
              </span>
            </div>
            <div className="signal-grid">
              <div className="signal-card">
                <div className="signal-label">
                  <span>MONITORING</span>
                  <span className="signal-symbol signal-green">◉</span>
                </div>
                <strong>Clear signals</strong>
                <small>Sources and alerts in view</small>
                <div className="signal-line">
                  <span />
                </div>
              </div>
              <div className="signal-card">
                <div className="signal-label">
                  <span>DELIVERY</span>
                  <span className="signal-symbol signal-blue">↗</span>
                </div>
                <strong>Connected</strong>
                <small>CI/CD integrations organized</small>
                <div className="integration-row">
                  <i>GH</i>
                  <i>GL</i>
                  <i>+</i>
                  <span>your tools</span>
                </div>
              </div>
            </div>
            <div className="activity-panel">
              <div className="activity-head">
                <span>TEAM ACTIVITY</span>
                <span>Recent</span>
              </div>
              <div className="activity-row">
                <span className="activity-icon icon-alert">!</span>
                <div>
                  <strong>Alert ready for review</strong>
                  <small>Monitoring · production</small>
                </div>
                <span className="activity-time">Just now</span>
              </div>
              <div className="activity-row">
                <span className="activity-icon icon-ai">✳</span>
                <div>
                  <strong>Analysis linked to alert</strong>
                  <small>AI-assisted · incident record</small>
                </div>
                <span className="activity-time">2m ago</span>
              </div>
            </div>
          </div>
          <div className="window-caption">
            <span className="caption-dot" /> An illustrative view of a connected
            DevOps workflow
          </div>
        </div>
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
      </section>

      <section className="trust-strip" aria-label="Platform principles">
        <div className="section-shell trust-items">
          <span>BUILT FOR TEAMS THAT MOVE FAST</span>
          <i /> <span>One workspace</span>
          <i /> <span>Tenant-scoped by design</span>
          <i /> <span>Monthly plans</span>
        </div>
      </section>

      <section className="problem-section section-shell">
        <div className="section-intro">
          <p className="eyebrow">THE DEVOPS TAX</p>
          <h2>
            Too many tools.
            <br />
            <span>Too little clarity.</span>
          </h2>
        </div>
        <div className="problem-copy">
          <p>
            Small teams shouldn’t need a dedicated DevOps department just to
            keep delivery and infrastructure understandable.
          </p>
          <p>
            Devobs brings the moving parts together in an organization-scoped
            workspace—with the context your team needs to act.
          </p>
        </div>
      </section>

      <section className="features-section section-shell" id="features">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ONE CLEARER WAY TO OPERATE</p>
            <h2>
              Everything your team needs
              <br />
              <span>to stay ahead.</span>
            </h2>
          </div>
          <p>
            Start with the essentials. Add the capabilities that fit your team
            as you grow.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-top">
                <span className="feature-number">{feature.number}</span>
                <span className="feature-icon" aria-hidden="true">
                  {feature.icon}
                </span>
              </div>
              <p className="feature-tag">{feature.tag}</p>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <span className="feature-arrow" aria-hidden="true">
                ↗
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="workflow-section">
        <div className="section-shell workflow-inner">
          <div>
            <p className="eyebrow">LESS TOOL-HOPPING. MORE MOMENTUM.</p>
            <h2>
              A calmer path from
              <br />
              <span>signal to action.</span>
            </h2>
            <p className="workflow-copy">
              Connect your organization, keep operational context together, and
              give every teammate a clearer next step.
            </p>
            <Link className="text-link" href="/register">
              Bring your team to Devobs <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div
            className="workflow-steps"
            aria-label="How Devobs brings work together"
          >
            <div className="workflow-step">
              <span className="step-number">01</span>
              <div>
                <strong>Connect</strong>
                <p>
                  Bring your CI/CD and monitoring sources into an organization
                  workspace.
                </p>
              </div>
              <span className="step-mark">↗</span>
            </div>
            <div className="step-connector" aria-hidden="true" />
            <div className="workflow-step">
              <span className="step-number">02</span>
              <div>
                <strong>Understand</strong>
                <p>Keep alerts and their investigation context together.</p>
              </div>
              <span className="step-mark">◉</span>
            </div>
            <div className="step-connector" aria-hidden="true" />
            <div className="workflow-step">
              <span className="step-number">03</span>
              <div>
                <strong>Improve</strong>
                <p>
                  Give your team a shared record to learn from after each
                  incident.
                </p>
              </div>
              <span className="step-mark">✳</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing-section section-shell" id="pricing">
        <div className="section-heading pricing-heading">
          <div>
            <p className="eyebrow">SIMPLE, MONTHLY PRICING</p>
            <h2>Choose your starting point.</h2>
          </div>
          <p>
            Every plan starts with a 14-day trial for first-time subscriptions.
            Change plans as your needs evolve.
          </p>
        </div>
        <div className="pricing-grid">
          {(
            Object.entries(PLAN_CATALOG) as [
              BillingPlan,
              (typeof PLAN_CATALOG)[BillingPlan],
            ][]
          ).map(([planKey, plan]) => {
            const price = prices[planKey];
            return (
              <article
                className={`price-card${planKey === "FULL" ? " price-card-featured" : ""}`}
                key={planKey}
              >
                {planKey === "FULL" && (
                  <span className="popular-label">MOST COMPLETE</span>
                )}
                <p className="plan-name">{plan.name}</p>
                <p className="plan-description">{plan.description}</p>
                <div className="price-line">
                  <strong>{price?.label ?? "Monthly"}</strong>
                  <span>{price ? "/ month" : "billing"}</span>
                </div>
                {!price && (
                  <p className="price-note">
                    Current amount is shown by Stripe at checkout.
                  </p>
                )}
                <p className="trial-note">
                  <span aria-hidden="true">✳</span> 14-day free trial for new
                  subscriptions
                </p>
                <ul>
                  {planHighlights[planKey].map((highlight) => (
                    <li key={highlight}>
                      <span aria-hidden="true">✓</span>
                      {highlight}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`button ${planKey === "FULL" ? "button-primary" : "button-card"}`}
                  href="/register"
                >
                  Start free trial <span aria-hidden="true">→</span>
                </Link>
              </article>
            );
          })}
        </div>
        <p className="pricing-footnote">
          Prices are billed monthly. A first-time trial is available once per
          organization; Stripe confirms the amount before checkout.
        </p>
      </section>

      <section className="contact-section" id="contact">
        <div className="section-shell contact-grid">
          <div className="contact-copy">
            <p className="eyebrow">LET’S TALK</p>
            <h2>
              Have a question?
              <br />
              <span>We’re listening.</span>
            </h2>
            <p>
              Tell us a little about your team and what you’re trying to
              improve. We’ll get back to you by email.
            </p>
            <div className="contact-note">
              <span className="contact-note-icon">↗</span>
              <span>
                Built for the people building
                <br />
                what comes next.
              </span>
            </div>
          </div>
          <div className="contact-form-card">
            <div className="form-heading">
              <span className="form-mark">✳</span>
              <div>
                <h3>Get in touch</h3>
                <p>Tell us what your team needs.</p>
              </div>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>

      <section className="closing-cta section-shell">
        <p className="eyebrow">MAKE OPERATIONS FEEL LIGHTER</p>
        <h2>
          Your next deployment
          <br />
          <span>starts with clarity.</span>
        </h2>
        <Link className="button button-primary" href="/register">
          Try Devobs free for 14 days <span aria-hidden="true">→</span>
        </Link>
        <p>No charge during the trial for first-time subscriptions.</p>
      </section>

      <footer className="site-footer section-shell">
        <Link className="brand" href="/" aria-label="Devobs home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            devobs<span className="brand-period">.</span>
          </span>
        </Link>
        <p>Operations, with a clearer view.</p>
        <div className="footer-links">
          <a href="#features">Platform</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
          <Link href="/login">Log in</Link>
        </div>
        <span className="footer-copy">
          © {new Date().getFullYear()} Devobs. All rights reserved.
        </span>
      </footer>
    </main>
  );
}
