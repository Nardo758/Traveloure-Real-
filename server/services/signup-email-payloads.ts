import { buildEmailVerificationPayload, buildWelcomeEmailPayload, getAppBaseUrl, type SendEmailParams } from "./email.service";
import { escHtml } from "../utils/email-escape";

export const SIGNUP_PUBLIC_RESPONSE = {
  message: "Check your inbox for the next steps. If you already have an account, we’ll email you how to sign in.",
};
export const REMINDER_DELAYS = [60 * 60 * 1000, 24 * 60 * 60 * 1000, 3 * 24 * 60 * 60 * 1000] as const;
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export function signupLanguage(preferences: unknown): "en" | "es" {
  const p = preferences as { language?: string; settings?: { language?: string } } | null;
  return (p?.settings?.language ?? p?.language)?.split("-")[0] === "es" ? "es" : "en";
}

export function signupEmail(
  name: string, to: string, firstName: string | null, language: "en" | "es", verifyUrl?: string,
): SendEmailParams {
  if (name === "verify_email" && language === "en") {
    return buildEmailVerificationPayload({ toEmail: to, firstName, verifyUrl: verifyUrl!, expiresInHours: 24 });
  }
  if (name === "welcome_email" && language === "en") return buildWelcomeEmailPayload({ toEmail: to, firstName });
  const es = language === "es";
  const greeting = firstName?.trim() ? `${es ? "Hola" : "Hi"} ${firstName.trim()},` : es ? "Hola," : "Hi,";
  let subject: string;
  let body: string;
  let link = `${getAppBaseUrl()}/dashboard`;
  if (name === "verify_email") {
    subject = "Confirma tu correo de Traveloure";
    body = "Confirma tu dirección de correo. Este enlace caduca en 24 horas.";
    link = verifyUrl!;
  } else if (name === "welcome_email") {
    subject = "Te damos la bienvenida a Traveloure";
    body = "Tu correo está verificado. Ya puedes empezar a planificar tu viaje.";
  } else if (name === "already_have_account") {
    subject = es ? "Cómo acceder a tu cuenta de Traveloure" : "How to sign in to your Traveloure account";
    body = es
      ? "Ya tienes una cuenta con esta dirección. Inicia sesión o usa «Olvidé mi contraseña». Si no solicitaste esto, ignora este correo."
      : "You already have an account with this address. Sign in or use Forgot password. If you didn’t request this, you can ignore this email.";
    link = `${getAppBaseUrl()}/?signin=true`;
  } else {
    subject = es ? "Recordatorio: confirma tu correo de Traveloure" : "Reminder: verify your Traveloure email";
    body = es
      ? "Tu correo aún no está verificado. Inicia sesión y solicita un nuevo enlace de verificación desde tu cuenta."
      : "Your email is not verified yet. Sign in and request a fresh verification link from your account.";
  }
  const text = `${greeting}\n\n${body}\n\n${link}`;
  return {
    to, subject, text,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px"><h2>${escHtml(subject)}</h2><p>${escHtml(greeting)}</p><p>${escHtml(body)}</p><a href="${escHtml(link)}">${escHtml(link)}</a></div>`,
  };
}