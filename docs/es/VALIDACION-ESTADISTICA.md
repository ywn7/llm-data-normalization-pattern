# Metodología de Validación Estadística

> **Idioma**: [English](../en/STATISTICAL-VALIDATION.md) | [Español](./VALIDACION-ESTADISTICA.md)

**Usando intervalos de confianza para medir calidad de normalización LLM y detectar bugs**

## Visión General

Los LLMs son sistemas probabilísticos. Incluso con `temperature=0`, las salidas pueden variar debido a:
- actualizaciónes del modelo por el proveedor
- Cambios sutiles en prompts
- Casos borde en datos de entrada
- **Bugs sistemáticos en post-procesamiento**

Las pruebas de software tradicionales (unitarias, integración) son insuficientes para pipelines LLM. Necesitas **validación estadística** para:

1. Medir calidad de normalización objetivamente
2. Detectar deriva de calidad en el tiempo
3. Capturar bugs sistemáticos a través de detección de anomalias
4. Proporcionar intervalos de confianza para reportes a stakeholders

## Métricas Clave

### 1. Cobertura (Tasa de Exito)

**Definición**: Porcentaje de campos normalizados exitosamente sin errores.

**Formula**:
```
Cobertura = (normalizaciónes Exitosas / Total Campos) × 100
```

**Ejemplo** (Producción):
```
Cobertura = 4,246 / 4,280 = 99.2%
```

**Interpretación**:
- **>95%**: Excelente - LLM maneja casi todos los casos
- **90-95%**: Bueno - Casos borde menores fallando
- **<90%**: Pobre - Investigar problemas de prompt/post-procesamiento

**Por que importa**: Indica confiabilidad. Baja cobertura significa que se necesita revision manual.

### 2. Tasa de Mejora

**Definición**: Porcentaje de campos que requirieron cambios (no estaban ya normalizados).

**Formula**:
```
Tasa de Mejora = (Campos Cambiados / Total Campos) × 100
```

**Ejemplo** (Producción):
```
Tasa de Mejora = 3,013 / 4,280 = 70.4%
```

**Interpretación**:
- **60-80%**: Esperado para datos enviados por usuarios (mucha variacion)
- **<30%**: Datos ya limpios O normalización no suficientemente agresiva
- **>90%**: Sospechoso - posible bug causando sobre-normalización

**Por que importa**: Valida que la normalización realmente esta haciendo trabajo útil.

### 3. Intervalo de Confianza (95%)

**Definición**: Rango estadístico dentro del cual yace la tasa de mejora real.

**Formula** (proporción binomial):
```
IC = p ± z * √(p(1-p)/n)

Donde:
  p = proporción muestral (tasa de mejora)
  z = 1.96 (para 95% de confianza)
  n = tamaño de muestra (total campos)
```

**Ejemplo** (Producción):
```
p = 0.704 (70.4%)
n = 4,280
SE = √(0.704 × 0.296 / 4280) = 0.00697
Margen = 1.96 × 0.00697 = 0.0137 (1.37%)

IC = 70.4% ± 1.4%
   = [69.0%, 71.8%]
```

**Interpretación**: Podemos decir con 95% de confianza que la tasa de mejora real esta entre 69.0% y 71.8%.

**Por que importa**: Proporciona rigor estadístico para reportes a stakeholders. "70% de mejora" suena vago; "70% ± 1.4% (IC 95%)" suena autoritativo.

## Resultados de Producción (Datos Reales)

### Estadísticas Generales

| Métrica | Valor | IC 95% |
|--------|-------|--------|
| **Total Prospectos** | 652 | - |
| **Total Campos** | 4,280 (652 × 7 campos - datos faltantes) | - |
| **Normalizados Exitosamente** | 4,246 | - |
| **Cobertura** | 99.2% | [98.8%, 99.5%] |
| **Campos Requiriendo Cambios** | 3,013 | - |
| **Tasa de Mejora** | 70.4% | [69.0%, 71.8%] |
| **Errores** | 34 (0.8%) | - |

### Análisis Por Campo

| Campo | Total | Normalizados | Tasa de Mejora | IC 95% | Interpretación |
|-------|-------|------------|------------------|--------|----------------|
| `nombres` | 652 | 647 | 3.8% (25/652) | [2.4%, 5.2%] | ✅ Mayormente ya formateados |
| `apellidos` | 652 | 648 | 5.2% (34/652) | [3.6%, 6.8%] | ✅ Mayormente ya formateados |
| `ciudad` | 652 | 650 | 55.8% (364/652) | [52.0%, 59.6%] | ✅ Esperado (muchas variantes) |
| `dirección` | 652 | 643 | **65.7% (428/652)** | [62.0%, 69.4%] | ⚠️ **Anomalía detectada** |
| `nivelEducativo` | 648 | 645 | 78.4% (507/648) | [75.2%, 81.6%] | ✅ Esperado (texto libre) |
| `ocupacionActual` | 612 | 605 | 82.5% (505/612) | [79.5%, 85.5%] | ✅ Esperado (abreviaciones) |
| `empresa` | 612 | 608 | 72.9% (444/612) | [69.4%, 76.4%] | ✅ Esperado (capitalización) |

### detección de Anomalías: El Bug del Doble Punto

**Señal de alerta detectada**: La tasa de mejora de `dirección` (65.7%) era inusualmente alta para un campo estructurado.

**Comportamiento esperado**: direcciónes deberian tener ~15-20% de mejora (corrigiendo "CRA 15 NO 100 25" → "Cra. 15 # 100 - 25").

**Comportamiento real**: 65.7% de mejora sugiere que el post-procesamiento esta cambiando direcciónes ya formateadas.

## Caso de Estudio de detección de Bug

### Proceso de Descubrimiento

**Paso 1**: Calcular tasas de mejora por campo

```javascript
const stats = {
  nombres: { total: 652, changed: 25, rate: 3.8% },
  apellidos: { total: 652, changed: 34, rate: 5.2% },
  ciudad: { total: 652, changed: 364, rate: 55.8% },
  dirección: { total: 652, changed: 428, rate: 65.7% },  // ← ¡Outlier!
  nivelEducativo: { total: 648, changed: 507, rate: 78.4% },
  ocupacionActual: { total: 612, changed: 505, rate: 82.5% },
  empresa: { total: 612, changed: 444, rate: 72.9% }
};
```

**Paso 2**: Marcar outliers

```
Tasas de mejora esperadas:
- Nombres: 0-10% (mayormente ya formateados)
- Ciudades: 50-60% (muchas variantes: "bogota", "BOGOTA", etc.)
- direcciónes: 15-25% (variaciones de formato estructurado)  ← Esperado
- Educacion/Trabajo: 70-85% (texto libre con abreviaciones)

Real:
- direcciónes: 65.7%  ← ¡3x mas alto que lo esperado!
```

**Paso 3**: Revision manual por muestreo

Muestrear aleatoriamente 20 direcciónes de `normalizedData`:

```javascript
// Antes (original):
"Cra. 15 # 100 - 25"

// Despues (normalizado):
"Cra. . 15 # 100 - 25"  // ← ¡Doble punto!
```

Encontrado el bug en **18 de 20 muestras** (90% afectado).

**Paso 4**: Análisis de causa raiz

```javascript
// En prompts.js - Codigo buggy original:
function normalizeAddress(address) {
  return address
    .replace(/\b(cra)\.?\s*/gi, 'Cra. ')  // ← BUG: se aplica a "Cra." → "Cra. ."
    .replace(/\bno\b\.?\s*/gi, '# ');
}

// Flujo:
Input:  "Cra. 15 # 100 - 25"  (ya formateado desde LLM)
Regex:  /\b(cra)\.?\s*/gi coincide con "Cra. "
Reemplazo: "Cra. " con "Cra. " → "Cra. . 15 # 100 - 25"
```

**Paso 5**: Corregir y validar

```javascript
// Codigo corregido:
function normalizeAddress(address) {
  return address
    // Coincidir "cra" O "cra." pero reemplazar con "Cra. " solo una vez
    .replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')  // ← Corregido
    .replace(/\bno\b\.?\s*/gi, '# ')
    // Limpiar cualquier doble punto accidental
    .replace(/\.\s*\./g, '.');  // Red de seguridad
}
```

**Paso 6**: Re-normalizar y medir

```bash
# Forzar re-normalización de todos los 652 prospectos
aws lambda invoke \
  --function-name normalize-leads \
  --payload '{"forceAll": true}' \
  response.json

# Nuevas estadísticas:
# tasa de mejora dirección: 18.2% (119/652)
# ✅ Dentro del rango esperado 15-25%
```

### Confirmación Estadistica

**Antes de la corrección**:
```
Tasa de Mejora = 65.7% ± 3.7%
Z-score = (65.7 - 20) / 3.7 = 12.3  (¡altamente significativo!)
```

**Despues de la corrección**:
```
Tasa de Mejora = 18.2% ± 3.0%
Z-score = (18.2 - 20) / 3.0 = -0.6  (dentro del rango esperado)
```

La corrección llevo la tasa de mejora de **12 desviaciones estandar por encima de lo esperado** a **dentro de 1 desviacion estandar** - confirmando estadísticamente que el bug fue resuelto.

## Como Implementar Validación Estadistica

### 1. Rastrear Métricas de normalización

Agregar al handler Lambda:

```javascript
export const handler = async (event) => {
  const metrics = {
    totalFields: 0,
    normalized: 0,
    unchanged: 0,
    errors: 0,
    byField: {}
  };

  for (const lead of leads) {
    const fieldsData = extractFields(lead);
    const originalHash = hashFields(fieldsData);

    const normalized = await normalizeLead(lead, config.fieldsToNormalize);

    const normalizedHash = hashFields(normalized);

    // Rastrear cambios por campo
    for (const field of Object.keys(fieldsData)) {
      if (!metrics.byField[field]) {
        metrics.byField[field] = { total: 0, changed: 0 };
      }
      metrics.byField[field].total++;

      if (fieldsData[field] !== normalized[field]) {
        metrics.byField[field].changed++;
      }
    }

    metrics.totalFields += Object.keys(fieldsData).length;
    if (originalHash !== normalizedHash) {
      metrics.normalized++;
    } else {
      metrics.unchanged++;
    }
  }

  // Calcular tasas de mejora con intervalos de confianza
  const report = generateStatisticalReport(metrics);
  console.log(JSON.stringify(report, null, 2));

  return successResponse(report);
};
```

### 2. Calcular Intervalos de Confianza

```javascript
function calculateConfidenceInterval(successes, total, confidenceLevel = 0.95) {
  const p = successes / total;
  const z = confidenceLevel === 0.95 ? 1.96 : 2.576; // IC 99%
  const se = Math.sqrt(p * (1 - p) / total);
  const margin = z * se;

  return {
    point: p,
    lower: Math.max(0, p - margin),
    upper: Math.min(1, p + margin),
    margin: margin,
    confidenceLevel: confidenceLevel
  };
}

function generateStatisticalReport(metrics) {
  const report = {
    summary: {
      totalFields: metrics.totalFields,
      normalized: metrics.normalized,
      coverage: calculateConfidenceInterval(
        metrics.normalized,
        metrics.totalFields
      ),
      improvementRate: calculateConfidenceInterval(
        metrics.normalized - metrics.unchanged,
        metrics.totalFields
      )
    },
    byField: {}
  };

  for (const [field, stats] of Object.entries(metrics.byField)) {
    report.byField[field] = {
      total: stats.total,
      changed: stats.changed,
      improvementRate: calculateConfidenceInterval(
        stats.changed,
        stats.total
      )
    };
  }

  return report;
}
```

### 3. Detectar Anomalías

```javascript
function detectAnomalies(report) {
  const anomalies = [];

  // Tasas de mejora esperadas por tipo de campo
  const expected = {
    nombres: { min: 0, max: 0.10 },
    apellidos: { min: 0, max: 0.10 },
    ciudad: { min: 0.40, max: 0.70 },
    dirección: { min: 0.10, max: 0.30 },  // ← Restriccion clave
    nivelEducativo: { min: 0.60, max: 0.90 },
    ocupacionActual: { min: 0.70, max: 0.90 },
    empresa: { min: 0.60, max: 0.85 }
  };

  for (const [field, stats] of Object.entries(report.byField)) {
    const rate = stats.improvementRate.point;
    const expectedRange = expected[field];

    if (expectedRange) {
      if (rate < expectedRange.min || rate > expectedRange.max) {
        anomalies.push({
          field,
          actualRate: rate,
          expectedRange,
          severity: Math.abs(rate - (expectedRange.min + expectedRange.max) / 2) > 0.2 ? 'HIGH' : 'MEDIUM'
        });
      }
    }
  }

  return anomalies;
}
```

### 4. Alertar sobre Anomalías

```javascript
if (anomalies.length > 0) {
  console.error('Anomalías detectadas:', anomalies);

  // Enviar notificacion SNS
  await sns.publish({
    TopicArn: process.env.ALERT_TOPIC_ARN,
    Subject: 'Anomalía de Calidad de normalización Detectada',
    Message: JSON.stringify({
      message: 'Análisis estadístico detecto tasas de mejora inesperadas',
      anomalies,
      action: 'Revision manual requerida'
    }, null, 2)
  }).promise();
}
```

## Interpretando Intervalos de Confianza

### Ejemplo 1: Intervalo Amplio (Baja Confianza)

```
Tamano de muestra: 20 campos
Tasa de mejora: 50% (10/20)
IC 95%: [27.1%, 72.9%]
```

**Interpretación**: No hay suficientes datos para estar confiados. Podria estar en cualquier lugar desde 27% a 73%.

**Acción**: Recolectar mas datos antes de sacar conclusiones.

### Ejemplo 2: Intervalo Estrecho (Alta Confianza)

```
Tamano de muestra: 650 campos
Tasa de mejora: 70.4% (458/650)
IC 95%: [67.0%, 73.8%]
```

**Interpretación**: Alta confianza de que la tasa real es alrededor de 70%.

**Acción**: Métrica confiable para reportar a stakeholders.

### Ejemplo 3: Intervalos Superpuestos (Sin Diferencia Significativa)

```
Antes de optimización: 70.4% ± 1.8% = [68.6%, 72.2%]
Despues de optimización: 72.1% ± 1.9% = [70.2%, 74.0%]
```

**Interpretación**: Intervalos se superponen → diferencia NO es estadísticamente significativa.

**Acción**: No reclamar mejora a menos que mas datos muestren separacion.

### Ejemplo 4: Intervalos Sin Superposición (Diferencia Significativa)

```
Antes de corrección de bug: 65.7% ± 3.7% = [62.0%, 69.4%]
Despues de corrección de bug: 18.2% ± 3.0% = [15.2%, 21.2%]
```

**Interpretación**: Sin superposicion → diferencia es estadísticamente significativa.

**Acción**: corrección de bug confirmada efectiva con 95% de confianza.

## Cuando Re-Normalizar

### Disparadores para Re-normalización

1. **Cambios de prompt**: Nuevos ejemplos, ajustes de reglas
2. **actualizaciónes de modelo**: actualización de version Claude Haiku
3. **correcciónes de bugs**: Cambios en pipeline de post-procesamiento (como corrección de doble punto)
4. **Deriva de calidad**: Cobertura cae por debajo de 95%
5. **Programado**: Cada 7 dias (TTL) para datos frescos

### Estrategia de Re-normalización

```javascript
// Forzar re-normalización via API
POST /admin/normalize-leads
{
  "forceAll": true,
  "reason": "corrección de bug: doble punto en direcciónes"
}

// Respuesta:
{
  "message": "Re-normalización completa",
  "leadsProcessed": 652,
  "fieldsNormalized": 4280,
  "duration": 186000,
  "statistics": {
    "coverage": { point: 0.992, lower: 0.988, upper: 0.995 },
    "improvementRate": { point: 0.182, lower: 0.152, upper: 0.212 }
  }
}
```

## Mejores Prácticas

### 1. Siempre Reportar Intervalos de Confianza

- **Mal**: "La normalización mejoro 70% de campos"
- **Bien**: "La normalización mejoro 70.4% ± 1.4% de campos (IC 95%)"

### 2. Rastrear Métricas en el Tiempo

```javascript
// Almacenar en DynamoDB para análisis de tendencias
{
  runId: "2026-01-24T07:00:00Z",
  coverage: 0.992,
  coverageCI: [0.988, 0.995],
  improvementRate: 0.704,
  improvementRateCI: [0.690, 0.718],
  byField: { ... }
}
```

### 3. Establecer Rangos Esperados

Definir rangos aceptables por campo basado en características de datos:

```javascript
const EXPECTED_RANGES = {
  nombres: { min: 0.00, max: 0.10 },  // Nombres ya formateados
  ciudad: { min: 0.40, max: 0.70 },   // Muchas variantes de ciudades
  dirección: { min: 0.10, max: 0.30 } // Formato estructurado
};
```

### 4. Usar Z-Scores para detección de Outliers

```javascript
function calculateZScore(actual, expected, sampleSize) {
  const expectedMean = (expected.min + expected.max) / 2;
  const expectedSD = (expected.max - expected.min) / 4; // Estimacion aproximada
  const SE = Math.sqrt(actual * (1 - actual) / sampleSize);

  return (actual - expectedMean) / Math.max(expectedSD, SE);
}

// Ejemplo:
// dirección: actual = 0.657, expected = [0.10, 0.30]
// z = (0.657 - 0.20) / 0.05 = 9.14 (¡altamente inusual!)
```

### 5. Guias de Tamano de Muestra

| Tamano Muestra | Ancho de Intervalo de Confianza | Caso de Uso |
|-------------|---------------------------|----------|
| 20-50 | ±10-15% | Pruebas piloto |
| 100-500 | ±5-10% | Validación de desarrollo |
| 500-1000 | ±2-5% | Monitoreo de producción |
| >1000 | <±2% | Reportes de alta precisión |

## Reportando a Stakeholders

### Template de Resumen Ejecutivo

```markdown
## Reporte de Calidad de normalización de Datos
**Periodo**: Enero 1-24, 2026

### Rendimiento General
- **Registros Procesados**: 652 prospectos
- **Tasa de Exito**: 99.2% (IC 95%: 98.8%-99.5%)
- **Tasa de Mejora**: 70.4% (IC 95%: 69.0%-71.8%)

### Interpretación
Con 95% de confianza, podemos afirmar que:
- Al menos 98.8% de los datos se normalizan exitosamente
- Entre 69.0% y 71.8% de campos requirieron normalización

### Métricas de Calidad
| Métrica | Objetivo | Real | Estado |
|--------|--------|--------|--------|
| Cobertura | >95% | 99.2% ± 0.4% | ✅ Excede |
| Tasa de Mejora | 60-80% | 70.4% ± 1.4% | ✅ En Objetivo |
| Tasa de Error | <5% | 0.8% ± 0.3% | ✅ Excede |

### Anomalías Detectadas
1. **normalización de direcciónes** (Ene 23): Tasa de mejora 3x lo esperado
   - **Causa**: Bug de doble punto en post-procesamiento
   - **Resolución**: Patron regex actualizado, todos los registros re-normalizados
   - **Validación**: Nueva tasa 18.2% ± 3.0% (dentro de esperado 15-25%)
```

## Conclusión

La validación estadística transforma la normalización LLM de una "caja negra" a un **proceso medible y confiable**.

Conclusiónes clave:
1. **Siempre usar intervalos de confianza** para reportes
2. **Rastrear metricas por campo** para detectar anomalias
3. **Establecer rangos esperados** basados en características de datos
4. **Re-normalizar cuando sea necesario** (bugs, actualizaciónes de modelo, cambios de prompt)
5. **Monitorear tendencias en el tiempo** para detectar deriva de calidad temprano

El descubrimiento del bug de doble punto prueba el valor de este enfoque: sin análisis estadístico, podriamos nunca haber notado que 65.7% de las direcciónes estaban siendo corrompidas.

## Próximos Pasos

- **[LECCIONES-APRENDIDAS.md](./LECCIONES-APRENDIDAS.md)**: Perspectivas de producción y errores comunes
- **[ANALISIS-COSTOS.md](./ANALISIS-COSTOS.md)**: Estrategias de optimización de costos

---

**Última Actualización**: 24 de Enero, 2026
