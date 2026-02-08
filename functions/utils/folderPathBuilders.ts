// ========================================
// FOLDER PATH BUILDERS - Utilities for FolderTreeSchema
// ========================================

/**
 * Sanitizes a name for use in file/folder paths
 * Removes invalid characters and trims whitespace
 */
export function sanitizeName(name) {
  if (!name) return 'Unknown';
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown';
}

/**
 * Available tokens for filename templates
 */
export const FILENAME_TOKENS = {
  '{Case_No}': (ctx) => ctx.caseData?.case_number || '',
  '{Client_Name}': (ctx) => ctx.client?.name || '',
  '{Client_No}': (ctx) => ctx.client?.client_number || '',
  '{Case_Type}': (ctx) => ctx.caseData?.case_type || '',
  '{Official_No}': (ctx) => ctx.caseData?.application_number || '',
  '{Mail_Subject}': (ctx) => ctx.mail?.subject || '',
  '{Mail_Date}': (ctx) => {
    const date = ctx.mail?.received_at ? new Date(ctx.mail.received_at) : new Date();
    return date.toISOString().split('T')[0];
  },
  '{Date}': () => new Date().toISOString().split('T')[0],
  '{Year}': () => new Date().getFullYear().toString(),
  '{Month}': () => String(new Date().getMonth() + 1).padStart(2, '0'),
  '{Original_Filename}': (ctx) => ctx.originalFilename || 'document',
};

/**
 * Resolves a filename template by replacing tokens with actual values
 * @param {string} template - The filename template with tokens
 * @param {object} context - Context object with caseData, client, mail, etc.
 * @returns {string} - Resolved filename
 */
export function resolveFilenameTemplate(template, context) {
  if (!template) return context.originalFilename || 'document';
  
  let result = template;
  
  for (const [token, resolver] of Object.entries(FILENAME_TOKENS)) {
    result = result.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), resolver(context));
  }
  
  // Clean up any remaining empty tokens or double spaces
  result = result.replace(/\{\w+\}/g, '').replace(/\s+/g, ' ').trim();
  
  return sanitizeName(result) || context.originalFilename || 'document';
}

/**
 * Resolves a dynamic level value based on source and format
 * @param {object} level - Level configuration
 * @param {object} context - Context with client, caseData, user, etc.
 * @returns {string} - Resolved folder name for this level
 */
function resolveDynamicLevel(level, context) {
  const { source, format } = level;
  
  switch (source) {
    case 'client': {
      if (!context.client) return '_לא_משוייך';
      const fmt = format || '{client_number} - {client_name}';
      return fmt
        .replace('{client_number}', sanitizeName(context.client.client_number || ''))
        .replace('{client_name}', sanitizeName(context.client.name || ''))
        .replace('{client_id}', context.client.id || '');
    }
    
    case 'case': {
      if (!context.caseData) return 'ממתין_לשיוך';
      const fmt = format || '{case_number}';
      return fmt
        .replace('{case_number}', sanitizeName(context.caseData.case_number || ''))
        .replace('{case_title}', sanitizeName(context.caseData.title || ''))
        .replace('{case_type}', sanitizeName(context.caseData.case_type || ''))
        .replace('{application_number}', sanitizeName(context.caseData.application_number || ''));
    }
    
    case 'user': {
      if (!context.user) return 'system';
      const fmt = format || '{user_name}';
      return fmt
        .replace('{user_name}', sanitizeName(context.user.full_name || context.user.email || ''))
        .replace('{user_email}', sanitizeName(context.user.email || ''))
        .replace('{department}', sanitizeName(context.user.department || ''));
    }
    
    case 'date': {
      const now = new Date();
      const fmt = format || '{year}';
      return fmt
        .replace('{year}', now.getFullYear().toString())
        .replace('{month}', String(now.getMonth() + 1).padStart(2, '0'))
        .replace('{day}', String(now.getDate()).padStart(2, '0'))
        .replace('{year_month}', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    
    default:
      return 'unknown';
  }
}

/**
 * Resolves a static or pool level value based on path_selections
 * @param {object} level - Level configuration
 * @param {object} pathSelections - User's path selections keyed by level.key
 * @returns {string|null} - Resolved folder name or null if not selected
 */
function resolveStaticOrPoolLevel(level, pathSelections) {
  const selection = pathSelections?.[level.key];
  
  if (!selection) {
    // For static levels with single value, use that value
    if (level.type === 'static' && level.values?.length === 1) {
      return level.values[0].code;
    }
    return null;
  }
  
  // Find the matching value
  const matchingValue = level.values?.find(v => v.code === selection);
  return matchingValue ? matchingValue.code : selection;
}

/**
 * Builds a Dropbox path from a FolderTreeSchema and context
 * @param {object} schema - FolderTreeSchema object
 * @param {object} pathSelections - User's path selections { levelKey: selectedCode }
 * @param {object} context - Context object { client, caseData, user, mail, documentType, subfolder }
 * @returns {string} - Complete Dropbox path
 */
export function buildPathFromSchema(schema, pathSelections = {}, context = {}) {
  if (!schema || !schema.levels || !Array.isArray(schema.levels)) {
    console.warn('[PathBuilder] Invalid schema');
    return null;
  }
  
  const parts = [];
  
  // Add root path
  if (schema.root_path) {
    parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
  }
  
  // Sort levels by order
  const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  for (const level of sortedLevels) {
    let folderName = null;
    
    switch (level.type) {
      case 'dynamic':
        folderName = resolveDynamicLevel(level, context);
        break;
        
      case 'static':
      case 'pool':
        folderName = resolveStaticOrPoolLevel(level, pathSelections);
        break;
        
      default:
        console.warn(`[PathBuilder] Unknown level type: ${level.type}`);
    }
    
    if (folderName) {
      parts.push(sanitizeName(folderName));
    } else if (level.required !== false) {
      // Required level without value - use placeholder
      console.warn(`[PathBuilder] Missing required level: ${level.key}`);
      parts.push(`_${level.key}_`);
    }
  }
  
  return '/' + parts.join('/');
}


/**
 * Validates path selections against a schema
 * @param {object} schema - FolderTreeSchema
 * @param {object} pathSelections - User's selections
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validatePathSelections(schema, pathSelections) {
  const errors = [];
  
  if (!schema || !schema.levels) {
    return { valid: false, errors: ['Invalid schema'] };
  }
  
  for (const level of schema.levels) {
    // Skip dynamic levels (they're resolved from context)
    if (level.type === 'dynamic') continue;
    
    // Check required pool/static levels
    if (level.required !== false && level.type !== 'static') {
      const selection = pathSelections?.[level.key];
      if (!selection) {
        errors.push(`Missing required selection for level: ${level.label || level.key}`);
      }
    }
    
    // Validate selection is in allowed values
    if (pathSelections?.[level.key] && level.values) {
      const validCodes = level.values.map(v => v.code);
      if (!validCodes.includes(pathSelections[level.key])) {
        errors.push(`Invalid selection for level ${level.key}: ${pathSelections[level.key]}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generates a preview of the path with placeholders for dynamic values
 * Useful for UI display before actual context is available
 */
export function generatePathPreview(schema, pathSelections = {}) {
  if (!schema || !schema.levels) return '/...';
  
  const parts = [];
  
  if (schema.root_path) {
    parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
  }
  
  const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));
  
  for (const level of sortedLevels) {
    switch (level.type) {
      case 'dynamic':
        parts.push(`[${level.label || level.key}]`);
        break;
        
      case 'static':
        if (level.values?.length === 1) {
          parts.push(level.values[0].code);
        } else {
          const selected = pathSelections[level.key];
          parts.push(selected || `<${level.label || level.key}>`);
        }
        break;
        
      case 'pool':
        const selected = pathSelections[level.key];
        parts.push(selected || `<${level.label || level.key}>`);
        break;
    }
  }
  
  return '/' + parts.join('/');
}