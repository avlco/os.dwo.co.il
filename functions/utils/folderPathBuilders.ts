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
 * Resolves a dynamic level value based on source and source_field
 * @param {object} level - Level configuration
 * @param {object} context - Context with client, caseData, user, etc.
 * @returns {object} - { name: display name, number: entity number or null }
 */
function resolveDynamicLevel(level, context) {
  const { source, source_field, numbering } = level;

  let displayName = '';
  let entityNumber = null;

  switch (source) {
    case 'client': {
      if (!context.client) {
        return { name: '_לא_משוייך', number: null };
      }
      // Get display name from specified field
      const field = source_field || 'name';
      displayName = sanitizeName(context.client[field] || context.client.name || '');
      // Get entity number if numbering is entity_field
      if (numbering?.type === 'entity_field' && numbering.field) {
        entityNumber = context.client[numbering.field] || context.client.client_number;
      }
      break;
    }

    case 'case': {
      if (!context.caseData) {
        return { name: 'ממתין_לשיוך', number: null };
      }
      const field = source_field || 'title';
      displayName = sanitizeName(context.caseData[field] || context.caseData.title || '');
      if (numbering?.type === 'entity_field' && numbering.field) {
        entityNumber = context.caseData[numbering.field] || context.caseData.case_number;
      }
      break;
    }

    default:
      return { name: 'unknown', number: null };
  }

  return { name: displayName, number: entityNumber };
}

/**
 * Resolves a static or list level value based on path_selections
 * Values can be either strings or {code, name, numbering} objects
 * @param {object} level - Level configuration
 * @param {object} pathSelections - User's path selections keyed by level.key
 * @returns {object} - { name: resolved folder name, numbering: value-specific numbering or null }
 */
function resolveStaticOrPoolLevel(level, pathSelections) {
  const selection = pathSelections?.[level.key];

  // Helper to get value string from either format
  const getValue = (val) => typeof val === 'string' ? val : (val?.name || val?.code || '');

  if (!selection) {
    // For static levels with single value, use that value
    if (level.type === 'static' && level.values?.length === 1) {
      return { name: getValue(level.values[0]), numbering: null };
    }
    return { name: null, numbering: null };
  }

  // Find matching value - handle both string and object formats
  const matchingValue = level.values?.find(v => {
    const valStr = getValue(v);
    return valStr === selection || v?.code === selection;
  });

  if (matchingValue) {
    return {
      name: getValue(matchingValue),
      // For list type, get numbering from the value object
      numbering: (level.type === 'list' && matchingValue?.numbering) ? matchingValue.numbering : null
    };
  }

  return { name: selection, numbering: null };
}

/**
 * Formats a folder name with numbering
 * @param {string} name - The base folder name
 * @param {string|number|null} number - The number to add
 * @param {object} numbering - Numbering configuration { type, position }
 * @param {string} separator - Separator between number and name
 * @returns {string} - Formatted folder name
 */
function formatFolderNameWithNumber(name, number, numbering, separator = ' - ') {
  if (!numbering || numbering.type === 'none' || !number) {
    return name;
  }

  const numStr = String(number);
  const position = numbering.position || 'prefix';

  if (position === 'prefix') {
    return `${numStr}${separator}${name}`;
  } else {
    return `${name}${separator}${numStr}`;
  }
}

/**
 * Builds a Dropbox path from a FolderTreeSchema and context
 * Returns both the path and metadata about levels that need chronological numbering
 * @param {object} schema - FolderTreeSchema object
 * @param {object} pathSelections - User's path selections { levelKey: selectedValue }
 * @param {object} context - Context object { client, caseData, user, mail }
 * @returns {object} - { path: string, levelsNeedingChronological: array }
 */
export function buildPathFromSchema(schema, pathSelections = {}, context = {}) {
  if (!schema || !schema.levels || !Array.isArray(schema.levels)) {
    console.warn('[PathBuilder] Invalid schema');
    return null;
  }

  const parts = [];
  const levelsNeedingChronological = [];

  // Add root path
  if (schema.root_path) {
    parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
  }

  // Sort levels by order
  const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));

  for (let i = 0; i < sortedLevels.length; i++) {
    const level = sortedLevels[i];
    let numbering = level.numbering || { type: 'none' };
    const separator = level.separator || ' - ';
    let baseName = null;
    let entityNumber = null;

    switch (level.type) {
      case 'dynamic': {
        const resolved = resolveDynamicLevel(level, context);
        baseName = resolved.name;
        entityNumber = resolved.number;
        break;
      }

      case 'static': {
        // Static type has no numbering
        const resolved = resolveStaticOrPoolLevel(level, pathSelections);
        baseName = resolved.name;
        numbering = { type: 'none' }; // Force no numbering for static
        break;
      }

      case 'list':
      case 'pool': {
        const resolved = resolveStaticOrPoolLevel(level, pathSelections);
        baseName = resolved.name;
        // For list type, use value-specific numbering if available
        if (resolved.numbering) {
          numbering = resolved.numbering;
        }
        break;
      }

      default:
        console.warn(`[PathBuilder] Unknown level type: ${level.type}`);
    }

    if (baseName) {
      // Handle numbering
      if (numbering.type === 'entity_field' && entityNumber) {
        // Use entity field number directly
        const folderName = formatFolderNameWithNumber(baseName, entityNumber, numbering, separator);
        parts.push(sanitizeName(folderName));
      } else if (numbering.type === 'chronological') {
        // Mark this level as needing chronological number resolution
        levelsNeedingChronological.push({
          levelIndex: i,
          pathIndex: parts.length,
          baseName: sanitizeName(baseName),
          numbering,
          separator
        });
        // Add placeholder that will be replaced
        parts.push(`__CHRONO_${i}__${sanitizeName(baseName)}`);
      } else {
        // No numbering
        parts.push(sanitizeName(baseName));
      }
    } else if (level.required !== false) {
      console.warn(`[PathBuilder] Missing required level: ${level.key}`);
      parts.push(`_${level.key}_`);
    }
  }

  return {
    path: '/' + parts.join('/'),
    parts,
    levelsNeedingChronological
  };
}


/**
 * Validates path selections against a schema
 * @param {object} schema - FolderTreeSchema
 * @param {object} pathSelections - User's selections
 * @returns {object} - { valid: boolean, errors: string[] }
 */
export function validatePathSelections(schema, pathSelections) {
  const errors = [];
  const getValue = (val) => typeof val === 'string' ? val : (val?.name || val?.code || '');

  if (!schema || !schema.levels) {
    return { valid: false, errors: ['Invalid schema'] };
  }

  for (const level of schema.levels) {
    // Skip dynamic levels (they're resolved from context)
    if (level.type === 'dynamic') continue;

    // For static with single value, no selection needed
    if (level.type === 'static' && level.values?.length === 1) continue;

    // Check required list/pool levels
    if (level.required !== false && (level.type === 'list' || level.type === 'pool')) {
      const selection = pathSelections?.[level.key];
      if (!selection) {
        errors.push(`Missing required selection for level: ${level.label || level.key}`);
      }
    }

    // Validate selection is in allowed values
    if (pathSelections?.[level.key] && level.values) {
      const validValues = level.values.map(v => getValue(v));
      const selection = pathSelections[level.key];
      if (!validValues.includes(selection)) {
        errors.push(`Invalid selection for level ${level.key}: ${selection}`);
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
  const getValue = (val) => typeof val === 'string' ? val : (val?.name || val?.code || '');

  if (schema.root_path) {
    parts.push(schema.root_path.replace(/^\/+|\/+$/g, ''));
  }

  const sortedLevels = [...schema.levels].sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const level of sortedLevels) {
    let numbering = level.numbering || { type: 'none' };
    const separator = level.separator || ' - ';
    let folderName = '';

    switch (level.type) {
      case 'dynamic':
        folderName = `[${level.label || level.key}]`;
        break;

      case 'static':
        // Static type has no numbering
        numbering = { type: 'none' };
        if (level.values?.length === 1) {
          folderName = getValue(level.values[0]);
        } else {
          const selected = pathSelections[level.key];
          folderName = selected || `<${level.label || level.key}>`;
        }
        break;

      case 'list':
      case 'pool': {
        const selected = pathSelections[level.key];
        folderName = selected || `<${level.label || level.key}>`;
        // For list type, get numbering from the selected value
        if (selected && level.values) {
          const selectedValue = level.values.find(v => getValue(v) === selected);
          if (selectedValue?.numbering) {
            numbering = selectedValue.numbering;
          }
        }
        break;
      }
    }

    // Add numbering indicator for preview
    if (numbering.type !== 'none') {
      const numIndicator = numbering.type === 'chronological' ? '###' : '#';
      if (numbering.position === 'suffix') {
        folderName = `${folderName}${separator}${numIndicator}`;
      } else {
        folderName = `${numIndicator}${separator}${folderName}`;
      }
    }

    parts.push(folderName);
  }

  return '/' + parts.join('/');
}

// Export formatFolderNameWithNumber for use in uploadToDropbox
export { formatFolderNameWithNumber };