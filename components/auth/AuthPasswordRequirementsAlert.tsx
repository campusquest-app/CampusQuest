import { PASSWORD_REQUIREMENT_RULES } from "@/lib/passwordRequirements";

export function AuthPasswordRequirementsAlert() {
  return (
    <div className="cq-auth-password-alert" role="alert">
      <p className="cq-auth-password-alert-title">Password Doesn&apos;t Meet Requirements</p>
      <p className="cq-auth-password-alert-lead">
        To keep your account secure, your password must include:
      </p>
      <ul className="cq-auth-password-alert-list">
        {PASSWORD_REQUIREMENT_RULES.map((rule) => (
          <li key={rule.key}>✓ {rule.label}</li>
        ))}
      </ul>
      <p className="cq-auth-password-alert-foot">Please update your password and try again.</p>
    </div>
  );
}
