import QRCode from "qrcode";

export type QuestQrPosterData = {
  questName: string;
  locationName?: string | null;
  xpReward: number;
  scanUrl: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load poster image."));
    img.src = src;
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = words[i] ?? "";
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

/** High-resolution printable quest QR poster (white background). */
export async function renderQuestQrPosterCanvas(
  data: QuestQrPosterData,
  scale = 2,
): Promise<HTMLCanvasElement> {
  const width = 900 * scale;
  const height = 1200 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const pad = 56 * scale;

  ctx.fillStyle = "#041E42";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `700 ${34 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText("CampusQuest", centerX, 48 * scale);

  ctx.font = `800 ${52 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const titleBottom = wrapCanvasText(ctx, data.questName.trim() || "Campus Quest", centerX, 120 * scale, width - pad * 2, 58 * scale);

  let qrTop = titleBottom + 36 * scale;
  if (data.locationName?.trim()) {
    ctx.fillStyle = "#475569";
    ctx.font = `600 ${26 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.fillText(data.locationName.trim(), centerX, titleBottom + 8 * scale);
    qrTop = titleBottom + 48 * scale;
  }

  const qrSize = 460 * scale;
  const qrDataUrl = await QRCode.toDataURL(data.scanUrl, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#041E42", light: "#ffffff" },
  });
  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, (width - qrSize) / 2, qrTop, qrSize, qrSize);

  const footerTop = qrTop + qrSize + 40 * scale;
  ctx.fillStyle = "#64748b";
  ctx.font = `500 ${22 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText("Scan in CampusQuest to complete this quest", centerX, footerTop);

  ctx.fillStyle = "#041E42";
  ctx.font = `800 ${34 * scale}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(`Earn ${data.xpReward} XP`, centerX, footerTop + 44 * scale);

  return canvas;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export async function downloadQuestQrPosterPdf(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const aspect = canvas.width / canvas.height;
  let drawWidth = maxWidth;
  let drawHeight = drawWidth / aspect;
  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
    drawWidth = drawHeight * aspect;
  }
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;
  const img = canvas.toDataURL("image/png");
  pdf.addImage(img, "PNG", x, y, drawWidth, drawHeight);
  pdf.save(filename);
}

export function slugifyPosterFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "quest";
}
