// Accept a small, explicit set. Never accept SVG/HTML or infer MIME from a filename alone.
export const maxPortfolioFileBytes = 10 * 1024 * 1024;
export function validatePortfolioFile(
  bytes: Uint8Array,
  mime: string,
  kind: string,
) {
  if (!bytes.length || bytes.length > maxPortfolioFileBytes)
    throw new Error("Files must be between 1 byte and 10 MB.");
  const prefix = new TextDecoder().decode(bytes.slice(0, 16));
  const valid =
    mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
        : mime === "image/webp"
          ? prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP"
          : mime === "application/pdf"
            ? prefix.startsWith("%PDF-")
            : mime === "text/plain"
              ? !bytes.includes(0)
              : false;
  if (
    !valid ||
    ![
      "photo",
      "cover",
      "project",
      "resume",
      "certificate",
      "document",
    ].includes(kind) ||
    (["photo", "cover", "project"].includes(kind) && !mime.startsWith("image/"))
  )
    throw new Error(
      "Use a JPEG, PNG or WebP image, PDF, or plain text document.",
    );
}
