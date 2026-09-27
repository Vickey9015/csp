import { useId, useState } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SERVICES = [
  { code: "01", name: "Field operations" },
  { code: "02", name: "Technical support" },
  { code: "03", name: "Managed contracts" },
];

export default function LoginPage({ onSuccess }) {
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const formErrorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function validate(nextEmail, nextPassword) {
    const next = {};
    if (!nextEmail.trim()) {
      next.email = "Enter your work email.";
    } else if (!EMAIL_PATTERN.test(nextEmail.trim())) {
      next.email = "Use a valid email address.";
    }
    if (!nextPassword) {
      next.password = "Enter your password.";
    } else if (nextPassword.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setResetSent(false);
    const nextErrors = validate(email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError("");
      return;
    }

    setSubmitting(true);
    setFormError("");

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    const normalized = email.trim().toLowerCase();
    if (normalized === "locked@cspservices.com") {
      setSubmitting(false);
      setFormError("This account is locked. Contact your CSP administrator.");
      return;
    }

    setSubmitting(false);
    onSuccess({ email: normalized, remember });
  }

  function handleReset(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!email.trim()) {
      nextErrors.email = "Enter your work email to reset the password.";
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      nextErrors.email = "Use a valid email address.";
    }
    setErrors((current) => ({ ...current, ...nextErrors, password: undefined }));
    setFormError("");
    if (nextErrors.email) {
      setResetSent(false);
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="shell">
      <section className="brand" aria-label="CSP Services">
        <div className="brand-top">
          <span className="mark" aria-hidden="true">
            CSP
          </span>
          <span className="est">Services</span>
        </div>
        <div className="brand-copy">
          <h1>Sign in to the service desk.</h1>
          <p>
            Jobs, contracts, and field updates for crews working under CSP
            Services.
          </p>
        </div>
        <ul className="service-list">
          {SERVICES.map((service) => (
            <li key={service.code}>
              <span>{service.code}</span>
              {service.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <form className="card" onSubmit={handleSubmit} noValidate>
          <header className="card-head">
            <p className="eyebrow">Account</p>
            <h2>Welcome back</h2>
            <p>Use the email your administrator issued for CSP Services.</p>
          </header>

          {formError ? (
            <p className="banner" id={formErrorId} role="alert">
              {formError}
            </p>
          ) : null}

          {resetSent ? (
            <p className="banner ok" role="status">
              If an account exists for {email.trim()}, a reset link is on its
              way.
            </p>
          ) : null}

          <div className="field">
            <label htmlFor={emailId}>Work email</label>
            <input
              id={emailId}
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="name@cspservices.com"
              value={email}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? emailErrorId : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
                setResetSent(false);
              }}
            />
            {errors.email ? (
              <p className="error" id={emailErrorId}>
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="field">
            <div className="label-row">
              <label htmlFor={passwordId}>Password</label>
              <button type="button" className="text-button" onClick={handleReset}>
                Forgot password
              </button>
            </div>
            <div className="password-wrap">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="At least 8 characters"
                value={password}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  [errors.password ? passwordErrorId : null, formError ? formErrorId : null]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: undefined }));
                }}
              />
              <button
                type="button"
                className="reveal"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password ? (
              <p className="error" id={passwordErrorId}>
                {errors.password}
              </p>
            ) : null}
          </div>

          <label className="remember">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Keep me signed in on this device
          </label>

          <button className="submit" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <p className="footnote">
            Need access? Ask your CSP Services administrator to issue an
            account.
          </p>
        </form>
      </section>
    </div>
  );
}
