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
