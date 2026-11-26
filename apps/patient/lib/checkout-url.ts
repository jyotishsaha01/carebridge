/** Provider checkout navigation must remain inside explicitly configured HTTPS origins. */
export function trustedCheckoutUrl(rawUrl: string, configuredOrigins = process.env.NEXT_PUBLIC_PAYMENT_CHECKOUT_ORIGINS ?? ""): string {
  const invalid = () => new Error("Secure payment is unavailable because the checkout destination is not approved. Please contact support.");
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw invalid(); }
  if (url.protocol !== "https:" || url.username || url.password) throw invalid();
  const allowed = configuredOrigins.split(",").map(value => value.trim()).filter(Boolean).some(value => {
    try {
      const origin = new URL(value);
      return origin.protocol === "https:" && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/" && origin.origin === url.origin;
    } catch { return false; }
  });
  if (!allowed) throw invalid();
  return url.toString();
}
