export interface PasswordPolicyResult {
  isValid: boolean;
  hasLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  hasNoRepeat: boolean;
  hasNoSequential: boolean;
  score: number;
  errors: string[];
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const pwd = password || '';
  const hasLength = pwd.length >= 12;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /\d/.test(pwd);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
  const hasNoRepeat = !/(.)\1{2,}/.test(pwd);

  let hasNoSequential = true;
  const lower = pwd.toLowerCase();
  for (let i = 0; i < lower.length - 2; i++) {
    const code = lower.charCodeAt(i);
    const next1 = lower.charCodeAt(i + 1);
    const next2 = lower.charCodeAt(i + 2);
    if (next1 === code + 1 && next2 === code + 2) {
      hasNoSequential = false;
      break;
    }
  }

  const errors: string[] = [];
  if (!hasLength) errors.push('Password must be at least 12 characters long');
  if (!hasUpper) errors.push('Password must contain at least one uppercase letter');
  if (!hasLower) errors.push('Password must contain at least one lowercase letter');
  if (!hasNumber) errors.push('Password must contain at least one number');
  if (!hasSpecial) errors.push('Password must contain at least one special character (!@#$%^&*...)');
  if (!hasNoRepeat) errors.push('Password cannot contain repeated characters (e.g. aaa, 111)');
  if (!hasNoSequential) errors.push('Password cannot contain sequential characters (e.g. abc, 123)');

  const checks = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial, hasNoRepeat, hasNoSequential];
  const score = checks.filter(Boolean).length;
  const isValid = score === checks.length;

  return {
    isValid,
    hasLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    hasNoRepeat,
    hasNoSequential,
    score,
    errors
  };
}
