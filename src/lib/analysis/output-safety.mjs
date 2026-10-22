const unsafeMutationPatterns = [
  /\brm\s+-rf\b/ig,
  /\bkubectl\s+delete\b/ig,
  /\bterraform\s+(?:apply|destroy)\b/ig,
  /\bDROP\s+DATABASE\b/ig,
  /\bgcloud\s+run\s+services\s+delete\b/ig,
  /\bdisable\s+(?:authentication|mfa|security|firewall)\b/ig,
];

const negatedAdvice = /\b(?:do not|don't|never|avoid|without)(?:\s+(?:run|execute|use|issue|apply|delete|destroy|disable|advise|recommend|suggest|the))*\s*$/i;

export function containsUnsafeMutationAdvice(text) {
  return unsafeMutationPatterns.some((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      const sentencePrefix = text.slice(Math.max(0, start - 120), start).split(/[.!?\n]/).at(-1) ?? "";
      if (!negatedAdvice.test(sentencePrefix)) return true;
    }
    return false;
  });
}
