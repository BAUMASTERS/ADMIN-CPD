const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyFS2IlnCB7BPxGmEiQHE5XiK93uWOBoSrP8RaWUxqcg3UTOdSpYpe0S29NCP62uslS/exec";
const APP_SCRIPT_URL_PATTERN = /^https:\/\/script\.google\.com\/(?:macros\/s\/[A-Za-z0-9_-]+|a\/macros\/[A-Za-z0-9.-]+\/s\/[A-Za-z0-9_-]+)\/exec$/;

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ success: false, error: "Method not allowed." });
  }

  const appScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL?.trim() || DEFAULT_APP_SCRIPT_URL;
  if (!APP_SCRIPT_URL_PATTERN.test(appScriptUrl)) {
    return response.status(503).json({
      success: false,
      error: "APPS_SCRIPT_WEB_APP_URL chưa được cấu hình đúng trên Vercel."
    });
  }

  if (request.method === "GET") {
    return forwardToAppsScript(appScriptUrl, undefined, response);
  }

  let body;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    const statusCode = error instanceof RequestBodyError ? error.statusCode : 400;
    return response.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : "Request body không hợp lệ."
    });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.action !== "string") {
    return response.status(400).json({ success: false, error: "Request cần action hợp lệ." });
  }

  return forwardToAppsScript(appScriptUrl, body, response);
}

async function forwardToAppsScript(url, body, response) {
  try {
    const upstream = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "follow",
      signal: AbortSignal.timeout(25000)
    });
    const text = await upstream.text();
    if (upstream.url.includes("accounts.google.com") || upstream.headers.get("content-type")?.includes("text/html")) {
      return response.status(502).json({
        success: false,
        error: "Apps Script yêu cầu đăng nhập Google. Hãy triển khai Web app với quyền truy cập từ Vercel (Anyone, nếu chính sách Workspace cho phép)."
      });
    }
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      return response.status(502).json({
        success: false,
        error: "Apps Script trả phản hồi không phải JSON. Kiểm tra quyền deployment và doGet/doPost."
      });
    }

    if (!upstream.ok) {
      return response.status(502).json({
        success: false,
        error: typeof result.error === "string" ? result.error : "Apps Script request thất bại."
      });
    }
    return response.status(200).json(result);
  } catch (error) {
    console.error("Apps Script proxy request failed:", error);
    return response.status(502).json({
      success: false,
      error: "Không thể kết nối Apps Script. Kiểm tra URL deployment và thử lại."
    });
  }
}

async function readRequestBody(request) {
  if (request.body !== undefined) {
    const raw = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      throw new RequestBodyError("Request body vượt quá 1 MB.", 413);
    }
    try {
      return typeof request.body === "string" ? JSON.parse(raw) : request.body;
    } catch {
      throw new RequestBodyError("Request body không phải JSON hợp lệ.", 400);
    }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new RequestBodyError("Request body vượt quá 1 MB.", 413);
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestBodyError("Request body không phải JSON hợp lệ.", 400);
  }
}

class RequestBodyError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}
