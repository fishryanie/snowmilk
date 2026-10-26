import { describe, expect, test } from "bun:test";
import { botSettingsSchema, decideAutoReply, defaultBotSettings } from "./automation";
import { safeMediaUrl } from "./types";
import { permissionForRequest, roleCan } from "../auth/permissions";

const context = { firstMessage: false, name: "An", chatType: "PRIVATE" };
describe("Zalo automation", () => {
  test("a matching menu rule carries its photo and optional caption", () => {
    const settings = defaultBotSettings();
    settings.rules[0].photoUrl = "https://cms.example.com/menu.jpg";
    for (const text of ["1", "xin menu", "cho mình xin menu", "thực đơn"]) {
      const decision = decideAutoReply(settings, text, context);
      expect(decision?.photoUrl).toBe(settings.rules[0].photoUrl);
      expect(decision?.text).toBe(settings.rules[0].response);
      expect(decision?.text).toContain("Dạ,");
      expect(decision?.text).not.toMatch(/https?:\/\//);
    }
    settings.rules[0].response = "Menu của tiệm đây ạ.";
    expect(decideAutoReply(settings, "xin menu", context)?.text).toBe("Menu của tiệm đây ạ.");
    settings.rules[0].response = "";
    expect(botSettingsSchema.safeParse(settings).success).toBe(true);
    expect(decideAutoReply(settings, "1", context)?.text).toBe("");
    delete settings.rules[0].photoUrl;
    expect(botSettingsSchema.safeParse(settings).success).toBe(false);
  });
  test("rule images require HTTPS and cannot contain URL credentials", () => {
    for (const photoUrl of ["data:image/png;base64,AAAA", "javascript:alert(1)", "http://example.com/menu.jpg", "https://user:password@example.com/menu.jpg"]) {
      const settings = defaultBotSettings(); settings.rules[0].photoUrl = photoUrl;
      expect(botSettingsSchema.safeParse(settings).success).toBe(false);
    }
    expect(permissionForRequest("/api/zalo-admin/images", "POST")).toBe("settings:manage");
  });
  test("supports both numbered choices and Vietnamese keywords with or without accents", () => {
    for (const text of ["1", "Chọn 1", "Mình muốn xem THỰC ĐƠN", "cho minh xem thuc don"]) {
      expect(decideAutoReply(defaultBotSettings(), text, context)?.ruleLabel).toBe("Xem menu & đặt món");
    }
  });
  test("matches whole words and prefers the more specific matching phrase", () => {
    const settings = defaultBotSettings();
    settings.rules[0].keywords = ["đơn"];
    expect(decideAutoReply(settings, "mình muốn hủy đơn", context)?.handoff).toBe(true);
    settings.rules[0].keywords = ["ship"];
    expect(decideAutoReply(settings, "friendship", context)?.source).toBe("fallback");
  });
  test("first-contact greeting and menu are distinct from repeated fallback", () => {
    expect(decideAutoReply(defaultBotSettings(), "xin chào", { ...context, firstMessage: true })?.text).toContain("Chào An");
    expect(decideAutoReply(defaultBotSettings(), "xyz", context)?.source).toBe("fallback");
    expect(decideAutoReply(defaultBotSettings(), "start", context)?.text).toContain("1. Xem menu");
  });
  test("honors disabled bot, paused chats, groups, bot senders and disabled rules", () => {
    expect(decideAutoReply({ ...defaultBotSettings(), enabled: false }, "1", context)).toBeNull();
    for (const overrides of [{ paused: true }, { chatType: "GROUP" }, { isBot: true }]) {
      expect(decideAutoReply(defaultBotSettings(), "1", { ...context, ...overrides })).toBeNull();
    }
    const settings = defaultBotSettings(); settings.rules[0].enabled = false;
    expect(decideAutoReply(settings, "1", context)?.source).toBe("fallback");
  });
  test("menu-only and keyword-only modes honor the configured matching method", () => {
    expect(decideAutoReply({ ...defaultBotSettings(), mode: "menu" }, "thực đơn", context)?.source).toBe("fallback");
    expect(decideAutoReply({ ...defaultBotSettings(), mode: "keywords" }, "1", context)?.source).toBe("fallback");
  });
  test("validates duplicate menu choices, duplicate rule IDs and empty enabled configurations", () => {
    const settings = defaultBotSettings();
    settings.rules[1].choice = "1";
    expect(botSettingsSchema.safeParse(settings).success).toBe(false);
    settings.rules[1].choice = "2"; settings.rules[1].id = settings.rules[0].id;
    expect(botSettingsSchema.safeParse(settings).success).toBe(false);
    expect(botSettingsSchema.safeParse({ ...defaultBotSettings(), rules: defaultBotSettings().rules.map(rule => ({ ...rule, enabled: false })) }).success).toBe(false);
  });
  test("keeps expanded greetings and the longest menu response within Zalo's 2000-character limit", () => {
    const settings = defaultBotSettings(); settings.greeting = "{name}".repeat(50);
    settings.fallback = "x".repeat(600); settings.menuIntro = "y".repeat(300);
    settings.rules = Array.from({ length: 9 }, (_, i) => ({ ...settings.rules[0], id: String(i), choice: String(i + 1), label: "z".repeat(60) }));
    expect(botSettingsSchema.safeParse(settings).success).toBe(true);
    expect(decideAutoReply(settings, "unknown", { ...context, firstMessage: true, name: "a".repeat(80) })!.text.length).toBeLessThanOrEqual(2000);
  });
  test("media URLs cannot introduce scripts or non-HTTPS content", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hello", "http://example.com/a", "invalid"]) expect(safeMediaUrl(url)).toBeUndefined();
    expect(safeMediaUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
  });
  test("staff may handle conversations but only owners may change automation", () => {
    expect(permissionForRequest("/api/zalo-admin/conversations/customer/reply", "POST")).toBe("sales:write");
    expect(permissionForRequest("/api/zalo-admin/settings", "PUT")).toBe("settings:manage");
    expect(roleCan("staff", "sales:write")).toBe(true);
    expect(roleCan("staff", "settings:manage")).toBe(false);
    expect(roleCan("viewer", "sales:write")).toBe(false);
  });
});
