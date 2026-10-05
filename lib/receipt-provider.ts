export class ReceiptScanError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

// API identifiers, not the product names shown in DeepSeek's model picker.
const visionModels = new Set(["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]);

export function receiptModelName(value?: string) {
  const model = value?.trim() || "deepseek-flash";
  if (!visionModels.has(model)) {
    throw new ReceiptScanError("Model đọc ảnh trên máy chủ chưa hợp lệ. Cần cập nhật cấu hình DeepSeek để đọc bill.", 503);
  }
  return model;
}

export function receiptProviderError(status: number) {
  if (status === 402) return new ReceiptScanError("Tài khoản DeepSeek chưa đủ số dư. Hãy nạp tiền rồi đọc lại bill.", 503);
  if (status === 401) return new ReceiptScanError("API key DeepSeek trên máy chủ không hợp lệ.", 503);
  if (status === 429) return new ReceiptScanError("DeepSeek đang bận. Hãy thử đọc lại bill sau ít phút.", 429);
  if (status === 400 || status === 404) return new ReceiptScanError("Cấu hình đọc bill trên máy chủ chưa hợp lệ. Cần kiểm tra model và yêu cầu gửi tới DeepSeek.", 503);
  if (status === 403) return new ReceiptScanError("DeepSeek từ chối truy cập từ máy chủ Snowmilk. Cần kiểm tra tài khoản và quyền truy cập API.", 503);
  if (status >= 500) return new ReceiptScanError("Dịch vụ DeepSeek đang gặp lỗi. Ảnh vẫn được giữ để đọc lại sau ít phút.", 503);
  return new ReceiptScanError(`DeepSeek từ chối yêu cầu đọc bill (HTTP ${status}). Ảnh vẫn được giữ; cần kiểm tra lỗi trên máy chủ.`);
}
