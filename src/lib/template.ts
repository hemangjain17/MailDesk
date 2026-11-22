import { TemplateVariables } from '@/types';

export interface RenderResult {
  renderedText: string;
  missingVariables: string[];
  hasUnresolvedPlaceholders: boolean;
}

const PLACEHOLDER_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g;

/**
 * Replaces placeholders like {{recipient_name}}, {{company}}, etc.
 * with actual values from the provided variables.
 * Tracks missing required variables and warns if any placeholders remain unresolved.
 */
export function renderTemplate(
  templateText: string,
  variables: TemplateVariables
): RenderResult {
  if (!templateText) {
    return {
      renderedText: '',
      missingVariables: [],
      hasUnresolvedPlaceholders: false,
    };
  }

  const missingVariables: string[] = [];

  const renderedText = templateText.replace(PLACEHOLDER_REGEX, (match, varName) => {
    const key = varName.trim() as keyof TemplateVariables;
    const value = variables[key];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value);
    }

    // Variable was not found or is empty
    missingVariables.push(varName);
    return match; // Leave unresolved so validator flags it
  });

  const remainingMatches = renderedText.match(PLACEHOLDER_REGEX) || [];

  return {
    renderedText,
    missingVariables: Array.from(new Set(missingVariables)),
    hasUnresolvedPlaceholders: remainingMatches.length > 0,
  };
}

/**
 * Renders an email body and turns standalone {{job_link}} placeholders into
 * clickable anchors. Existing authored links are left unchanged.
 */
export function normalizeJobLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function renderEmailBodyTemplate(
  templateText: string,
  variables: TemplateVariables
): RenderResult {
  if (!templateText || !variables.job_link) return renderTemplate(templateText, variables);
  const normalizedJobLink = normalizeJobLink(variables.job_link);

  const anchorRegex = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  let cursor = 0;
  let linkedTemplate = '';
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(templateText)) !== null) {
    linkedTemplate += templateText
      .slice(cursor, match.index)
      .replace(/\{\{job_link\}\}/g, '<a href="{{job_link}}">{{job_link}}</a>');
    linkedTemplate += match[0];
    cursor = match.index + match[0].length;
  }

  linkedTemplate += templateText
    .slice(cursor)
    .replace(/\{\{job_link\}\}/g, '<a href="{{job_link}}">{{job_link}}</a>');

  return renderTemplate(linkedTemplate, { ...variables, job_link: normalizedJobLink });
}

/**
 * Validates that an outreach message is ready to be scheduled or sent.
 * Checks for unresolved placeholders.
 */
export function validateEmailForSending(
  subject: string,
  body: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!subject.trim()) {
    errors.push('Subject cannot be empty.');
  }

  if (!body.trim()) {
    errors.push('Email body cannot be empty.');
  }

  const subjectPlaceholders = subject.match(PLACEHOLDER_REGEX) || [];
  if (subjectPlaceholders.length > 0) {
    errors.push(`Subject contains unresolved placeholders: ${subjectPlaceholders.join(', ')}`);
  }

  const bodyPlaceholders = body.match(PLACEHOLDER_REGEX) || [];
  if (bodyPlaceholders.length > 0) {
    errors.push(`Body contains unresolved placeholders: ${bodyPlaceholders.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
