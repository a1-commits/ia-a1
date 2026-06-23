function mojibakeScore(text: string): number {
  let score = 0;
  score += (text.match(/�/g) ?? []).length * 4;
  score += (text.match(/Ã|Â|â€™|â€œ|â€|ð/g) ?? []).length * 2;
  return score;
}

function tryLatin1ToUtf8(text: string): string {
  return Buffer.from(text, 'latin1').toString('utf8');
}

/** Remove blocos internos que não devem aparecer na resposta ao cliente. */
export function sanitizeAgentClientReply(text: string): string {
  let out = text.trim();
  out = out.replace(/\[modo offline[^\]]*\][\s\n]*/gi, '');
  out = out
    .split('\n')
    .filter((line) => {
      const l = line.toLowerCase();
      return !(
        /lead\s*score|readiness|roteiriza[cç][aã]o|motor interno|an[aá]lise interna/.test(l) ||
        /prontid[aã]o\s*\d|lead\s*\d+\s*\/\s*100/.test(l)
      );
    })
    .join('\n')
    .trim();
  return out;
}

/** Limita resposta ao formato recepcionista (2 frases, 25 palavras). */
export function clampMinimalReply(text: string): string {
  let out = text.replace(/\s+/g, ' ').trim();
  const parts = out.match(/[^.!?]+[.!?]?/g) ?? [out];
  out = parts
    .slice(0, 2)
    .join(' ')
    .trim();
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > 25) {
    out = `${words.slice(0, 25).join(' ')}…`;
  }
  return out;
}

/** Tenta corrigir texto com acentuação quebrada (mojibake). */
export function repairBrokenAccents(text: string): string {
  let best = text;
  let bestScore = mojibakeScore(best);
  if (bestScore === 0) {
    return text;
  }

  // Tenta mais de uma rodada para casos duplamente codificados.
  for (let i = 0; i < 2; i += 1) {
    const candidate = tryLatin1ToUtf8(best);
    const candidateScore = mojibakeScore(candidate);
    if (candidateScore < bestScore) {
      best = candidate;
      bestScore = candidateScore;
      continue;
    }
    break;
  }

  return best;
}

