function mojibakeScore(text: string): number {
  let score = 0;
  score += (text.match(/�/g) ?? []).length * 4;
  score += (text.match(/Ã|Â|â€™|â€œ|â€|ð/g) ?? []).length * 2;
  return score;
}

function tryLatin1ToUtf8(text: string): string {
  return Buffer.from(text, 'latin1').toString('utf8');
}

const HANDOFF_REPLY = 'Entendi. Como posso ajudar com isso?';

const HANDOFF_PHRASE_RE =
  /\b(vou|irei|vamos)\s+(encaminhar|transferir|passar|direcionar)\b|\b(encaminhando|transferindo)\s+(para|voc[eê])\b|\b(atendente|especialista|equipe|humano|operador|consultor)\s+(ir[aá]|entrar[aá]|continuar[aá]|atender[aá]|responder[aá])\b|\baguarde\s+(o\s+)?atendimento\b|\bnossa\s+equipe\s+(ir[aá]|vai)\b|\b(um|uma)\s+especialista\s+(ir[aá]|vai|entrar[aá])\b/i;

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
  if (HANDOFF_PHRASE_RE.test(out)) {
    return HANDOFF_REPLY;
  }
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

