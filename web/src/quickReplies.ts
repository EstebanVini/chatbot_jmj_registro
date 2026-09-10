export interface QuickReplyDef {
  match: RegExp;
  buttons: string[];
}

export const QUICK_REPLIES: QuickReplyDef[] = [
  {
    match: /\*Pasaporte\*/i,
    buttons: ['Pasaporte', 'Sin pasaporte']
  },
  {
    match: /responda con la palabra \*OK\*/i,
    buttons: ['OK', 'Enviar otra foto']
  },
  {
    match: /responda \*M\* para masculino/i,
    buttons: ['M', 'F']
  }
];

export function getQuickReplies(botText: string): string[] | null {
  for (const rule of QUICK_REPLIES) {
    if (rule.match.test(botText)) {
      return rule.buttons;
    }
  }
  return null;
}
