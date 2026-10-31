// Chyby AI vrstvy se srozumitelnou českou hláškou pro uživatele.

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI není nastavená – chybí GEMINI_API_KEY (zdarma) nebo ANTHROPIC_API_KEY v .env.local.");
  }
}

export class AiBudgetError extends Error {
  constructor(limit: number) {
    super(`Dnešní limit AI (${limit.toFixed(2)} $) je vyčerpaný. Zítra to půjde znovu, nebo limit zvyš v Nastavení.`);
  }
}

export class AiDisabledError extends Error {
  constructor() {
    super("AI funkce máš vypnuté v Nastavení.");
  }
}

export class AiRefusalError extends Error {
  constructor() {
    super("AI na tohle odmítla odpovědět. Zkus otázku formulovat jinak.");
  }
}

export class AiRequestLimitError extends Error {
  constructor(limit: number) {
    super(`Dnes jsi využil/a všech ${limit} AI požadavků. Zítra to půjde znovu.`);
  }
}
