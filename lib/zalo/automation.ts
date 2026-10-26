import { z } from "zod";

export const botRuleSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(60),
  choice: z.string().regex(/^[1-9]$/),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30),
  response: z.string().trim().max(1200),
  photoUrl: z.string().trim().max(2000).refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  }, "Ảnh cần có đường dẫn HTTPS hợp lệ.").optional(),
  enabled: z.boolean(),
  handoff: z.boolean(),
}).superRefine((rule, ctx) => {
  if (!rule.response && !rule.photoUrl) ctx.addIssue({ code: "custom", path: ["response"], message: "Nhập nội dung trả lời hoặc tải ảnh lên." });
});
export const botSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  mode: z.enum(["hybrid", "menu", "keywords"]),
  greeting: z.string().trim().min(1).max(300),
  menuIntro: z.string().trim().min(1).max(300),
  fallback: z.string().trim().min(1).max(600),
  rules: z.array(botRuleSchema).min(1).max(9),
}).superRefine((settings, ctx) => {
  if (new Set(settings.rules.map(rule => rule.id)).size !== settings.rules.length) {
    ctx.addIssue({ code: "custom", path: ["rules"], message: "Mỗi quy tắc cần một mã riêng." });
  }
  const active = settings.rules.filter(rule => rule.enabled);
  if (new Set(active.map(rule => rule.choice)).size !== active.length) {
    ctx.addIssue({ code: "custom", path: ["rules"], message: "Các lựa chọn đang bật không được trùng số." });
  }
  if (settings.enabled && !active.length) {
    ctx.addIssue({ code: "custom", path: ["rules"], message: "Bật ít nhất một câu trả lời trước khi bật bot." });
  }
});
export type BotSettings = z.infer<typeof botSettingsSchema>;
export type BotRule = BotSettings["rules"][number];
export type AutoDecision = { text: string; photoUrl?: string; source: "rule" | "menu" | "fallback"; ruleLabel?: string; handoff: boolean } | null;

export function defaultBotSettings(): BotSettings {
  return {
    revision: 0,
    enabled: true,
    mode: "hybrid",
    greeting: "Chào {name}, Cái Tiệm Sữa có thể hỗ trợ bạn nhé!",
    menuIntro: "Bạn nhập số tương ứng hoặc nhắn nội dung cần hỗ trợ:",
    fallback: "Tiệm chưa hiểu rõ ý bạn. Bạn chọn một mục bên dưới để tiệm hỗ trợ nhé.",
    rules: [
      { id: "order", choice: "1", label: "Xem menu & đặt món", keywords: ["menu", "thực đơn", "đặt món", "đặt hàng", "giá"], response: "Dạ, tiệm gửi bạn menu ạ 🥛 Bạn muốn dùng món nào cứ nhắn tiệm nhé!", photoUrl: "https://cms.caitiemsua.com/images/zalo/menu-v1.png", enabled: true, handoff: false },
      { id: "delivery", choice: "2", label: "Giao hàng & thanh toán", keywords: ["giao hàng", "ship", "thanh toán", "chuyển khoản", "cod"], response: "Bạn chọn món và nhập địa chỉ tại https://caitiemsua.com. Phí giao hàng và phương thức thanh toán được hiển thị trước khi bạn xác nhận đơn nhé.", enabled: true, handoff: false },
      { id: "staff", choice: "3", label: "Gặp nhân viên", keywords: ["nhân viên", "tư vấn", "hỗ trợ", "khiếu nại", "hủy đơn", "hoàn tiền"], response: "Tiệm đã ghi nhận yêu cầu của bạn. Cuộc trò chuyện đã chuyển sang chờ nhân viên hỗ trợ.", enabled: true, handoff: true },
    ],
  };
}

export function normalizeBotText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function menuText(settings: BotSettings): string {
  return [settings.menuIntro, ...settings.rules.filter(rule => rule.enabled).map(rule => `${rule.choice}. ${rule.label}`)].join("\n");
}

/** Shared by the live receiver and the local preview; never sends a message. */
export function decideAutoReply(settings: BotSettings, text: string | undefined, context: {
  firstMessage: boolean; name?: string; paused?: boolean; chatType?: string; isBot?: boolean;
}): AutoDecision {
  if (!settings.enabled || context.paused || context.isBot || context.chatType !== "PRIVATE") return null;
  const normalized = normalizeBotText(text ?? "");
  const rules = settings.rules.filter(rule => rule.enabled);
  let rule: BotRule | undefined;
  if (settings.mode !== "keywords") {
    const choice = normalized.match(/^(?:(?:chon|so) )?([1-9])$/)?.[1];
    rule = rules.find(candidate => candidate.choice === choice);
  }
  if (!rule && settings.mode !== "menu" && normalized) {
    let longest = 0;
    for (const candidate of rules) {
      for (const keyword of candidate.keywords) {
        const value = normalizeBotText(keyword);
        if (value && value.length > longest && ` ${normalized} `.includes(` ${value} `)) {
          rule = candidate;
          longest = value.length;
        }
      }
    }
  }
  const name = (context.name?.trim() || "bạn").slice(0, 80);
  const greeting = settings.greeting.replaceAll("{name}", name).slice(0, 300);
  if (rule) return {
    text: [context.firstMessage ? greeting : "", rule.response].filter(Boolean).join("\n\n"),
    ...(rule.photoUrl ? { photoUrl: rule.photoUrl } : {}),
    source: "rule", ruleLabel: rule.label, handoff: rule.handoff,
  };
  const asksMenu = /^(menu|start|bat dau|xin chao|chao|hello|hi)$/.test(normalized);
  if (settings.mode !== "keywords" && (context.firstMessage || asksMenu)) {
    return { text: `${greeting}\n\n${menuText(settings)}`, source: "menu", handoff: false };
  }
  return {
    text: [context.firstMessage ? greeting : "", settings.fallback, settings.mode !== "keywords" ? menuText(settings) : ""].filter(Boolean).join("\n\n"),
    source: "fallback", handoff: false,
  };
}
