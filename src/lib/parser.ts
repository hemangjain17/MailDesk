export interface ParsedContact {
  email: string;
  name?: string;
  company?: string;
  position?: string;
}

export interface ParseResult {
  valid: ParsedContact[];
  invalid: string[];
  duplicates: string[];
  totalRaw: number;
}

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function extractNameAndEmail(token: string): { email: string; name?: string } | null {
  const clean = token.trim();
  // Check "Name" <email@domain.com> or Name <email@domain.com>
  const angledMatch = clean.match(/^(?:["']?([^<"'\r\n]+)["']?\s+)?<([^>]+)>$/);
  if (angledMatch) {
    const rawName = angledMatch[1]?.trim();
    const email = angledMatch[2]?.trim().toLowerCase();
    if (email && EMAIL_REGEX.test(email)) {
      return { email, name: rawName && rawName.length > 0 ? rawName : undefined };
    }
  }

  const bare = clean.replace(/^[<"']+|[>"']+$/g, '').trim().toLowerCase();
  if (EMAIL_REGEX.test(bare)) {
    return { email: bare };
  }

  return null;
}

export function parseBulkContacts(
  rawInput: string,
  existingEmails: string[] = []
): ParseResult {
  const existingSet = new Set(existingEmails.map(e => e.toLowerCase().trim()));
  const seenInImport = new Set<string>();

  const valid: ParsedContact[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  let totalRaw = 0;

  const lines = rawInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // If line has tab delimiter, treat as tabular row
    if (line.includes('\t')) {
      const cols = line.split('\t').map(c => c.trim()).filter(Boolean);
      totalRaw++;
      const emailColIndex = cols.findIndex(c => extractNameAndEmail(c) !== null);

      if (emailColIndex !== -1) {
        const extracted = extractNameAndEmail(cols[emailColIndex])!;
        const email = extracted.email;

        if (seenInImport.has(email) || existingSet.has(email)) {
          duplicates.push(email);
        } else {
          seenInImport.add(email);
          const otherCols = cols.filter((_, idx) => idx !== emailColIndex);
          valid.push({
            email,
            name: extracted.name || otherCols[0] || undefined,
            company: otherCols[1] || undefined,
            position: otherCols[2] || undefined,
          });
        }
      } else {
        invalid.push(line);
      }
      continue;
    }

    // Split on comma, semicolon or line boundaries while keeping "Name" <email> intact
    // Match either:
    // 1. Optional name followed by <email>
    // 2. Individual non-comma, non-semicolon strings
    const segments: string[] = [];
    let remaining = line;

    // Extract all Name <email> occurrences
    const angledPattern = /(?:["'][^"']+["']|[a-zA-Z0-9\s._'-]+)?\s*<[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[^>]+>/g;
    let match: RegExpExecArray | null;

    let lastIndex = 0;
    while ((match = angledPattern.exec(line)) !== null) {
      // Chunk before the match
      const before = line.slice(lastIndex, match.index).trim();
      if (before) {
        const parts = before.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
        segments.push(...parts);
      }
      segments.push(match[0].trim());
      lastIndex = match.index + match[0].length;
    }
    const after = line.slice(lastIndex).trim();
    if (after) {
      const parts = after.split(/[,;]+/).map(p => p.trim()).filter(Boolean);
      segments.push(...parts);
    }

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;

      const extracted = extractNameAndEmail(trimmed);
      if (extracted) {
        totalRaw++;
        const email = extracted.email;
        if (seenInImport.has(email) || existingSet.has(email)) {
          duplicates.push(email);
        } else {
          seenInImport.add(email);
          valid.push({
            email,
            name: extracted.name,
          });
        }
      } else {
        // If it contains space-separated bare emails, check each
        const spaceSub = trimmed.split(/\s+/).map(s => s.trim()).filter(Boolean);
        for (const s of spaceSub) {
          totalRaw++;
          const subExtracted = extractNameAndEmail(s);
          if (subExtracted) {
            const email = subExtracted.email;
            if (seenInImport.has(email) || existingSet.has(email)) {
              duplicates.push(email);
            } else {
              seenInImport.add(email);
              valid.push({ email });
            }
          } else {
            invalid.push(s);
          }
        }
      }
    }
  }

  return {
    valid,
    invalid,
    duplicates,
    totalRaw,
  };
}
