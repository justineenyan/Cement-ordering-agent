import multer from "multer";
import * as path from "node:path";
import * as fs from "node:fs";
import { type Request } from "express";

// Ensure destination upload directory exists
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "proof_of_payment");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeBaseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    cb(null, `pop_${timestamp}_${randomSuffix}_${safeBaseName}${ext}`);
  }
});

// File type validation filter
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const allowedMimeTypes = [
    "image/jpeg",
    "image/pjpeg",
    "image/png",
    "image/webp",
    "application/pdf"
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(mime)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${ext || mime}. Allowed types are: JPG, JPEG, PNG, WEBP, and PDF.`
      )
    );
  }
};

/**
 * Multer middleware instance for handling Proof of Payment document uploads.
 * Max file size: 15 MB.
 */
export const uploadPoPMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB
    files: 1
  }
});

/**
 * Pre-configured single file upload handler accepting field names: "file", "image", or "proofOfPayment".
 */
export const uploadSinglePoP = uploadPoPMiddleware.fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "proofOfPayment", maxCount: 1 }
]);
