import { describe, expect, it } from "vitest";
import { prepareMedicalDownload } from "./medical-document";

const pdf = btoa("%PDF-1.7\nsynthetic report");
describe("medical document download boundary", () => {
  it("uses the validated MIME type for the extension instead of an untrusted executable name", () => {
    const result = prepareMedicalDownload({ contentBase64: pdf, contentType: "application/pdf", originalFileName: "care-instructions.command" });
    expect(result.fileName).toBe("care-instructions.pdf");
    expect(result.blob.type).toBe("application/pdf");
  });
  it("removes path, control and bidirectional filename characters", () => {
    const result = prepareMedicalDownload({ contentBase64: pdf, contentType: "application/pdf", originalFileName: "../private\u202e-report\n.command" });
    expect(result.fileName).not.toMatch(/[\/\\\u202e\n]/);
    expect(result.fileName).toMatch(/\.pdf$/);
  });
  it("refuses active content MIME types and mislabeled content", () => {
    expect(() => prepareMedicalDownload({ contentBase64: btoa("<script>alert(1)</script>"), contentType: "text/html", originalFileName: "report.pdf" })).toThrow("safely downloaded");
    expect(() => prepareMedicalDownload({ contentBase64: btoa("<script>alert(1)</script>"), contentType: "application/pdf", originalFileName: "report.pdf" })).toThrow("does not match");
  });
  it("refuses invalid or oversized base64 before creating a download", () => {
    expect(() => prepareMedicalDownload({ contentBase64: "not base64!", contentType: "application/pdf" })).toThrow();
    expect(() => prepareMedicalDownload({ contentBase64: "A".repeat(14_000_000), contentType: "application/pdf" })).toThrow();
  });
});
