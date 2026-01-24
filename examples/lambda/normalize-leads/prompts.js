/**
 * Normalization Prompts for Claude Haiku
 *
 * Defines field-specific prompts for data normalization.
 * Optimized for Claude 3 Haiku - concise and structured.
 */

/**
 * Colombian city name mappings for standardization
 */
const CITY_MAPPINGS = {
  // Bogota variants
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'bogota dc': 'Bogota D.C.',
  'bogota d.c.': 'Bogota D.C.',
  'bogota d.c': 'Bogota D.C.',
  'santafe de bogota': 'Bogota D.C.',

  // Medellin variants
  'medellin': 'Medellin',
  'medellín': 'Medellin',

  // Cali variants
  'cali': 'Cali',
  'santiago de cali': 'Cali',

  // Barranquilla variants
  'barranquilla': 'Barranquilla',
  'b/quilla': 'Barranquilla',

  // Cartagena variants
  'cartagena': 'Cartagena',
  'cartagena de indias': 'Cartagena',

  // Other major cities
  'bucaramanga': 'Bucaramanga',
  'pereira': 'Pereira',
  'manizales': 'Manizales',
  'santa marta': 'Santa Marta',
  'cucuta': 'Cucuta',
  'cúcuta': 'Cucuta',
  'ibague': 'Ibague',
  'ibagué': 'Ibague',
  'soacha': 'Soacha',
  'villavicencio': 'Villavicencio',
  'neiva': 'Neiva',
  'pasto': 'Pasto',
  'monteria': 'Monteria',
  'montería': 'Monteria',
  'valledupar': 'Valledupar',
  'armenia': 'Armenia',
  'popayan': 'Popayan',
  'popayán': 'Popayan',
  'sincelejo': 'Sincelejo',
  'tunja': 'Tunja',
  'florencia': 'Florencia',
  'quibdo': 'Quibdo',
  'quibdó': 'Quibdo',
  'riohacha': 'Riohacha',
  'yopal': 'Yopal',
  'leticia': 'Leticia',
  'mocoa': 'Mocoa',
  'mitu': 'Mitu',
  'mitú': 'Mitu',
  'inirida': 'Inirida',
  'inirídia': 'Inirida',
  'san andres': 'San Andres',
  'puerto carreno': 'Puerto Carreno',
  'puerto carreño': 'Puerto Carreno',
  'arauca': 'Arauca'
};

/**
 * Known educational institutions for standardization
 */
const INSTITUTION_PATTERNS = [
  { pattern: /sena|servicio nacional de aprendizaje/i, standard: 'SENA' },
  { pattern: /universidad nacional/i, standard: 'Universidad Nacional de Colombia' },
  { pattern: /u\s*nal|unal/i, standard: 'Universidad Nacional de Colombia' },
  { pattern: /universidad de los andes|uniandes/i, standard: 'Universidad de los Andes' },
  { pattern: /universidad javeriana|javeriana|puj/i, standard: 'Pontificia Universidad Javeriana' },
  { pattern: /universidad del rosario|rosario/i, standard: 'Universidad del Rosario' },
  { pattern: /universidad externado/i, standard: 'Universidad Externado de Colombia' },
  { pattern: /universidad de antioquia|udea/i, standard: 'Universidad de Antioquia' },
  { pattern: /eafit/i, standard: 'Universidad EAFIT' },
  { pattern: /universidad del valle|univalle/i, standard: 'Universidad del Valle' },
  { pattern: /universidad industrial de santander|uis/i, standard: 'Universidad Industrial de Santander' },
  { pattern: /universidad del norte|uninorte/i, standard: 'Universidad del Norte' },
  { pattern: /universidad santo tomas|usta/i, standard: 'Universidad Santo Tomas' },
  { pattern: /universidad libre/i, standard: 'Universidad Libre' },
  { pattern: /universidad de medellin/i, standard: 'Universidad de Medellin' },
  { pattern: /politecnico|poli gran colombiano/i, standard: 'Politecnico Grancolombiano' },
  { pattern: /minuto de dios|uniminuto/i, standard: 'Corporacion Universitaria Minuto de Dios' },
  { pattern: /colsubsidio/i, standard: 'Caja Colombiana de Subsidio Familiar Colsubsidio' }
];

/**
 * Generate the normalization prompt for Claude Haiku
 */
export function generateNormalizationPrompt(fieldsData) {
  const fieldsList = Object.entries(fieldsData)
    .map(([key, value]) => `- ${key}: "${value}"`)
    .join('\n');

  return `Normaliza los siguientes campos de un formulario de inscripcion en Colombia. Aplica estas reglas:

## Reglas de Normalizacion

### Nombres y Apellidos
- Capitalizar correctamente (primera letra mayuscula)
- Eliminar espacios extras
- Mantener tildes y caracteres especiales
- Ejemplo: "JUAN CARLOS PEREZ" -> "Juan Carlos Perez"

### Direccion
- Formato estandar colombiano: "Calle/Carrera/Avenida # - #"
- Abreviaturas: Cra., Cl., Av., Tr., Dg.
- Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"

### Ciudad
- Usar nombre oficial de la ciudad
- Bogota siempre como "Bogota D.C."
- Remover "Colombia" si esta incluido
- Ejemplo: "bogota colombia" -> "Bogota D.C."

### Nivel Educativo
- Estandarizar a: Primaria, Bachiller, Tecnico, Tecnologo, Profesional, Especialista, Magister, Doctorado
- Ejemplo: "BACHILLERATO COMPLETO" -> "Bachiller"

### Ocupacion/Empresa
- Capitalizar correctamente
- Eliminar espacios extras
- Estandarizar nombres conocidos (SENA, universidades)

## Campos a Normalizar

${fieldsList}

## Formato de Respuesta

Responde UNICAMENTE con un JSON valido:

{
  "campo1": "valor normalizado",
  "campo2": "valor normalizado"
}

Solo incluye campos que fueron modificados. Si un campo ya esta correctamente formateado, omitelo del JSON.`;
}

/**
 * Parse and validate Claude's normalization response
 */
export function parseNormalizationResponse(responseText) {
  // Extract JSON from response (handle potential markdown code blocks)
  let jsonStr = responseText;

  // Remove markdown code blocks if present
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Try to find raw JSON object
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate it's an object
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Response must be a JSON object');
    }

    // Post-process each field
    const normalized = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() !== '') {
        // Apply additional local normalization
        normalized[key] = postProcessField(key, value);
      }
    }

    return normalized;
  } catch (error) {
    console.error('Failed to parse normalization response:', error.message);
    console.error('Raw response:', responseText.substring(0, 500));
    throw new Error(`Error parsing response: ${error.message}`);
  }
}

/**
 * Apply local post-processing rules
 */
function postProcessField(fieldName, value) {
  let processed = value.trim();

  switch (fieldName) {
    case 'ciudad':
      // Check against known city mappings
      const lowerCity = processed.toLowerCase();
      if (CITY_MAPPINGS[lowerCity]) {
        return CITY_MAPPINGS[lowerCity];
      }
      // Ensure proper capitalization
      return capitalizeWords(processed);

    case 'empresa':
    case 'institucionEducativa':
      // Check against known institution patterns
      for (const { pattern, standard } of INSTITUTION_PATTERNS) {
        if (pattern.test(processed)) {
          return standard;
        }
      }
      return capitalizeWords(processed);

    case 'nombres':
    case 'apellidos':
      // Ensure proper capitalization and clean up
      return capitalizeWords(processed);

    case 'direccion':
      // Normalize address abbreviations
      return normalizeAddress(processed);

    case 'nivelEducativo':
      // Standardize education levels
      return normalizeEducationLevel(processed);

    default:
      return processed;
  }
}

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize Colombian address format
 */
function normalizeAddress(address) {
  let normalized = address
    // Standardize street type abbreviations (include optional dot to avoid ". .")
    .replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')
    .replace(/\b(calle|cl|cll)\.?\s*/gi, 'Cl. ')
    .replace(/\b(avenida|av|avda)\.?\s*/gi, 'Av. ')
    .replace(/\b(transversal|tr|trans|tv|transv)\.?\s*/gi, 'Tr. ')
    .replace(/\b(diagonal|dg|diag)\.?\s*/gi, 'Dg. ')
    // Standardize number indicators
    .replace(/\bno\b\.?\s*/gi, '# ')
    .replace(/\bnumero\b\.?\s*/gi, '# ')
    .replace(/\bn[°o]\s*/gi, '# ')
    // Clean up double dots that might have slipped through
    .replace(/\.\s*\./g, '.')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Normalize education level to standard values
 */
function normalizeEducationLevel(level) {
  const lowerLevel = level.toLowerCase();

  if (/primaria|basica primaria/i.test(lowerLevel)) return 'Primaria';
  if (/bachiller|secundaria|media|11/i.test(lowerLevel)) return 'Bachiller';
  if (/tecnic[oa]|tecnic/i.test(lowerLevel)) return 'Tecnico';
  if (/tecnolog/i.test(lowerLevel)) return 'Tecnologo';
  if (/profesional|pregrado|universitari/i.test(lowerLevel)) return 'Profesional';
  if (/especiali/i.test(lowerLevel)) return 'Especialista';
  if (/maestr[ií]a|magister|master/i.test(lowerLevel)) return 'Magister';
  if (/doctor|phd/i.test(lowerLevel)) return 'Doctorado';

  // Return original if no match (with proper capitalization)
  return capitalizeWords(level);
}

export default {
  generateNormalizationPrompt,
  parseNormalizationResponse
};
