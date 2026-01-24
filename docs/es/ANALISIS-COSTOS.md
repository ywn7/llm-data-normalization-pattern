# Analisis y Optimizacion de Costos

> **Idioma**: [English](../en/COST-ANALYSIS.md) | [Español](./ANALISIS-COSTOS.md)

**Desglose detallado de costos de normalizacion LLM y estrategias para minimizar gastos**

## Resumen Ejecutivo

**Costos de produccion** (652 prospectos, 4,280 campos normalizados):
- **Total**: $0.043
- **Por prospecto**: $0.000066 (6.6 centavos por 1,000 prospectos)
- **Por campo**: $0.00001 (1 centavo por 1,000 campos)

**Costos mensuales proyectados** (varias escalas):

| Volumen Mensual | Costo Total | Por Prospecto |
|----------------|------------|----------|
| 500 prospectos | $0.033 | $0.000066 |
| 1,000 prospectos | $0.066 | $0.000066 |
| 5,000 prospectos | $0.330 | $0.000066 |
| 10,000 prospectos | $0.660 | $0.000066 |
| 50,000 prospectos | $3.300 | $0.000066 |

**El costo es lineal y predecible** - $0.066 por 1,000 prospectos sin importar la escala.

## Desglose de Costos

### AWS Bedrock: Precios de Claude 3 Haiku

**Precios** (a Enero 2026):
- **Tokens de entrada**: $0.00025 por 1,000 tokens ($0.25 por 1M tokens)
- **Tokens de salida**: $0.00125 por 1,000 tokens ($1.25 por 1M tokens)

**Costo por lote** (10 prospectos, 7 campos cada uno):

| Componente | Tokens | Costo |
|-----------|--------|------|
| Prompt (overhead fijo) | ~800 | $0.0002 |
| Datos de prospecto (10 prospectos) | ~500 | $0.00013 |
| **Total entrada** | **~1,300** | **$0.00033** |
| **Salida (respuesta JSON)** | **~80** | **$0.0001** |
| **Total por lote** | **~1,380** | **$0.00043** |

**Costo por prospecto**: $0.00043 / 10 = **$0.000043**

**Costos reales de produccion** (652 prospectos):
- **Lotes**: 65 lotes (652 / 10)
- **Total tokens entrada**: ~84,500 tokens
- **Total tokens salida**: ~5,200 tokens
- **Costo total**: $0.028 (Bedrock) + $0.015 (Lambda/DynamoDB) = **$0.043**

### Costos de Lambda

**Configuracion**:
- Memoria: 512 MB
- Duracion: ~3 minutos para 50 prospectos
- Ejecuciones: 1 por dia (programado)

**Calculo de costos**:
```
Ejecuciones mensuales: 30
Duracion por ejecucion: 180s (3 min)
GB-segundos: (512 MB / 1024) × 180s × 30 = 2,700 GB-s

Precios Lambda:
- Primeros 400,000 GB-s/mes: GRATIS (bien dentro del tier gratuito)
- Solicitudes: 30/mes (GRATIS - primeras 1M solicitudes gratis)

Costo mensual Lambda: $0.00
```

**Lambda es efectivamente gratis** para esta carga de trabajo debido al Tier Gratuito de AWS.

### Costos de DynamoDB

**Operaciones por normalizacion**:
- **Lecturas**: 1 × `GetItem` (config) + 1 × `Scan` (prospectos) = ~100 unidades de lectura
- **Escrituras**: 50 × `UpdateItem` (prospectos normalizados) = 50 unidades de escritura

**Calculo de costos** (pay-per-request):
```
Lecturas mensuales: 100 lecturas × 30 dias = 3,000 lecturas
Escrituras mensuales: 50 escrituras × 30 dias = 1,500 escrituras

Precios DynamoDB:
- Lecturas: $0.25 por 1M lecturas → $0.00075
- Escrituras: $1.25 por 1M escrituras → $0.001875

Costo mensual DynamoDB: $0.0026 (~$0.003)
```

### Costos de EventBridge

**Invocaciones**: 1 por dia × 30 dias = 30 invocaciones/mes

**Costo**: Primeros 1 millon de eventos son GRATIS.

**Costo mensual EventBridge**: $0.00

### Costo Mensual Total (1,000 Prospectos/Mes)

| Servicio | Costo |
|---------|------|
| AWS Bedrock (Claude 3 Haiku) | $0.066 |
| Lambda | $0.000 (Tier Gratuito) |
| DynamoDB | $0.003 |
| EventBridge | $0.000 (Tier Gratuito) |
| **Total** | **$0.069** |

**Costo por prospecto**: $0.000069 (~7 centavos por 1,000 prospectos)

## Comparacion de Costos: Alternativas

### 1. Entrada Manual de Datos

**Escenario**: Contratar empleado de entrada de datos a $15/hora para normalizar 1,000 prospectos.

**Supuestos**:
- 5 minutos por prospecto (revisar 7 campos, estandarizar formatos)
- Tarifa por hora: $15

**Costo**:
```
Tiempo: 1,000 prospectos × 5 min = 5,000 min = 83.3 horas
Costo: 83.3 horas × $15/hora = $1,250
```

**Comparacion**: Este patron es **18,000x mas barato** que entrada manual.

### 2. ETL Personalizado Basado en Reglas

**Escenario**: Construir script Python personalizado con patrones regex y tablas de busqueda.

**Costos**:
- **Tiempo de desarrollo**: 2 semanas (80 horas) × $75/hora = $6,000
- **Mantenimiento**: 4 horas/mes × $75/hora = $300/mes
- **Runtime**: Lambda tier gratuito, DynamoDB minimo

**Costo primer ano**: $6,000 + ($300 × 12) = **$9,600**

**Comparacion**: Este patron se paga solo en < 1 mes si:
- Valoras el tiempo de desarrollo
- Necesitas flexibilidad (LLM se adapta a nuevos patrones sin cambios de codigo)
- No quieres mantener cientos de reglas regex

### 3. Claude 3.5 Sonnet (LLM de Gama Alta)

**Escenario**: Usar Sonnet en lugar de Haiku para normalizacion.

**Precios Sonnet**:
- Entrada: $0.003 por 1,000 tokens (12x mas caro)
- Salida: $0.015 por 1,000 tokens (12x mas caro)

**Costo por 1,000 prospectos**:
```
Haiku: $0.066
Sonnet: $0.792

Diferencia: $0.726 mas por 1,000 prospectos (aumento 12x)
```

**Cuando usar Sonnet**:
- Razonamiento complejo requerido (no es el caso para normalizacion)
- Mejora de calidad justifica costo 12x (raro para datos estructurados)

**Recomendacion**: Quedarse con Haiku a menos que metricas de calidad caigan por debajo de 95%.

### 4. GPT-4o-mini (Alternativa OpenAI)

**Escenario**: Usar OpenAI GPT-4o-mini en lugar de Claude Haiku.

**Precios GPT-4o-mini**:
- Entrada: $0.00015 por 1,000 tokens (40% mas barato que Haiku)
- Salida: $0.0006 por 1,000 tokens (52% mas barato que Haiku)

**Costo por 1,000 prospectos**:
```
Haiku: $0.066
GPT-4o-mini: $0.040

Diferencia: $0.026 ahorro por 1,000 prospectos (40% mas barato)
```

**Consideraciones**:
- **Pros**: Mas barato, ampliamente disponible
- **Contras**: Requiere API OpenAI (facturacion separada), formato API diferente, puede requerir ajuste de prompts

**Recomendacion**: Si ya usas API OpenAI, considerar GPT-4o-mini. De lo contrario, la integracion de Haiku con AWS (misma facturacion, autenticacion IAM) supera ahorros marginales de costos.

## Estrategias de Optimizacion de Costos

### 1. Aumentar Tamano de Lote

**Actual**: 10 prospectos por llamada API

**Optimizacion**: 20 prospectos por llamada API

**Impacto**:
```
Actual: 1,000 prospectos → 100 lotes × $0.00043 = $0.043
Optimizado: 1,000 prospectos → 50 lotes × $0.00055 = $0.028  (35% ahorro)
```

**Por que funciona**: Overhead del prompt se amortiza sobre mas prospectos.

**Trade-offs**:
- ⚠️ Mayor uso de memoria (512 MB → 768 MB podria ser necesario)
- ⚠️ Timeout mas largo necesario (300s podria no ser suficiente para lotes de 20)
- ✅ Menos llamadas API (mejor para rate limiting)

**Recomendacion**: Probar con 15-20 prospectos por lote, monitorear memoria/timeout de Lambda.

### 2. Reducir Campos Normalizados

**Actual**: 7 campos por prospecto

**Optimizacion**: Normalizar solo campos de alta prioridad (4 campos)

**Impacto**:
```
Actual: 7 campos × 1,000 prospectos = 7,000 campos → $0.066
Optimizado: 4 campos × 1,000 prospectos = 4,000 campos → $0.038  (42% ahorro)
```

**Trade-offs**:
- ⚠️ Normalizacion menos comprensiva
- ✅ Menores costos
- ✅ Procesamiento mas rapido

**Recomendacion**: Solo normalizar campos que impactan reportes/analitica.

**Matriz de prioridad**:

| Prioridad | Campos | Por Que |
|----------|--------|-----|
| Alta | ciudad, nivelEducativo, ocupacionActual | Alta varianza, impacta analitica |
| Media | empresa, direccion | Varianza moderada, nice to have |
| Baja | nombres, apellidos | Baja varianza, mayormente formateados |

### 3. Alargar TTL de Normalizacion

**Actual**: Re-normalizar cada 7 dias

**Optimizacion**: Re-normalizar cada 30 dias

**Impacto**:
```
Actual: 1,000 prospectos normalizados 4 veces/mes = 4,000 normalizaciones/mes
Optimizado: 1,000 prospectos normalizados 1 vez/mes = 1,000 normalizaciones/mes

Ahorro: 75% reduccion en costos de re-normalizacion
```

**Trade-offs**:
- ⚠️ Datos normalizados obsoletos si cambian prompts/modelos
- ✅ Reduccion de costos 4x para re-normalizaciones

**Recomendacion**: TTL 7 dias para datos activos, TTL 30 dias para datos archivados.

### 4. Usar Caching para Valores Repetidos

**Escenario**: Muchos prospectos comparten la misma ciudad/empresa.

**Optimizacion**: Cachear valores normalizados en memoria.

```javascript
const cache = new Map();

function normalizeCityWithCache(city) {
  const key = city.toLowerCase();

  if (cache.has(key)) {
    return cache.get(key);  // Omitir llamada LLM
  }

  const normalized = await normalizeLead({ ciudad: city });
  cache.set(key, normalized.ciudad);
  return normalized.ciudad;
}
```

**Impacto** (asumiendo 50 ciudades unicas en 1,000 prospectos):
```
Sin cache: 1,000 normalizaciones × $0.000066 = $0.066
Con cache: 50 normalizaciones × $0.000066 = $0.0033
Ahorro: 95% ($0.0627)
```

**Trade-offs**:
- ⚠️ Memoria: Tamano de cache (50 ciudades × 50 bytes = 2.5 KB, insignificante)
- ⚠️ Obsolescencia: Valores cacheados no reflejan mejoras de prompt (invalidar en despliegue)

**Recomendacion**: Implementar para `ciudad`, `empresa`, `nivelEducativo` (campos de baja cardinalidad).

### 5. Omitir Prospectos Ya Normalizados

**Actual**: Siempre re-normalizar si TTL expiro

**Optimizacion**: Hashear datos normalizados, omitir si sin cambios

```javascript
async function normalizeLead(lead) {
  const fieldsData = extractFields(lead);
  const currentHash = hashFields(fieldsData);

  if (lead.normalizedHash === currentHash) {
    console.log('Datos sin cambios, omitiendo normalizacion');
    return { normalized: false, reason: 'Sin cambios' };
  }

  // Proceder con normalizacion...
}
```

**Impacto**:
```
Escenario: 30% de prospectos no han cambiado desde ultima normalizacion
Sin optimizacion: 1,000 normalizaciones
Con optimizacion: 700 normalizaciones

Ahorro: 30% reduccion de costos
```

**Recomendacion**: Implementar si costos de re-normalizacion se vuelven significativos.

## Proyecciones de Costos de Escalado

### Pequena Escala (1,000 Prospectos/Mes)

| Servicio | Costo |
|---------|------|
| Bedrock | $0.066 |
| Lambda | $0.000 |
| DynamoDB | $0.003 |
| **Total** | **$0.069** |

**Costo por prospecto**: $0.000069

### Escala Media (10,000 Prospectos/Mes)

| Servicio | Costo |
|---------|------|
| Bedrock | $0.660 |
| Lambda | $0.005 |
| DynamoDB | $0.030 |
| **Total** | **$0.695** |

**Costo por prospecto**: $0.000069 (igual - escalado lineal)

### Gran Escala (100,000 Prospectos/Mes)

| Servicio | Costo |
|---------|------|
| Bedrock | $6.60 |
| Lambda | $0.50 |
| DynamoDB | $3.00 |
| **Total** | **$10.10** |

**Costo por prospecto**: $0.000101 (aumento marginal por Lambda/DynamoDB)

### Muy Gran Escala (1,000,000 Prospectos/Mes)

| Servicio | Costo |
|---------|------|
| Bedrock | $66.00 |
| Lambda | $5.00 |
| DynamoDB | $30.00 |
| **Total** | **$101.00** |

**Costo por prospecto**: $0.000101

**A esta escala, considerar**:
- Capacidad reservada para Lambda/DynamoDB (20-30% ahorro)
- Capa de caching (Redis/ElastiCache) para reducir normalizaciones redundantes
- Fine-tuning de modelo mas pequeno (Llama 3) para inferencia on-premise

## Analisis de ROI

### Escenario: Institucion Educativa (Este Proyecto)

**Contexto**: 100 estudiantes/mes se inscriben, 652 prospectos recolectados.

**Costos**:
- Normalizacion: $0.043 (unico para 652 prospectos)
- Infraestructura: $0.003/mes (DynamoDB)

**Beneficios**:
- **Precision de reportes**: Datos limpios habilitan analitica precisa
- **Ahorro de tiempo**: 5 horas/mes ahorradas en limpieza manual de datos (5 × $50/hora = $250/mes)
- **Evaluacion IA**: Calidad de prompt mejorada para evaluacion IA de candidatos downstream

**ROI**: (250 - 0.043 - 0.003) / 0.046 = **5,400% ROI** (retorno 54x)

### Escenario: Plataforma SaaS (10,000 Usuarios/Mes)

**Contexto**: SaaS B2B con datos de empresa/industria enviados por usuarios.

**Costos**:
- Normalizacion: $0.69/mes (10,000 usuarios × 3 campos)
- Tiempo de desarrollador ahorrado: 20 horas/mes × $100/hora = $2,000/mes

**ROI**: (2,000 - 0.69) / 0.69 = **289,800% ROI** (retorno 2,898x)

### Escenario: E-commerce (100,000 Productos/Mes)

**Contexto**: Marketplace con descripciones de productos enviadas por vendedores.

**Costos**:
- Normalizacion: $10.10/mes (100,000 productos × 5 campos)
- Reduccion de QA manual: 50 horas/mes × $75/hora = $3,750/mes

**ROI**: (3,750 - 10.10) / 10.10 = **37,000% ROI** (retorno 370x)

## Planificacion de Presupuesto

### Template de Presupuesto Mensual

```
Costos base (pay-per-request):
  Bedrock: $0.066 por 1,000 prospectos
  Lambda: $0.000 (Tier Gratuito hasta 400,000 GB-s)
  DynamoDB: $0.003 por 1,000 prospectos
  EventBridge: $0.000 (Tier Gratuito hasta 1M eventos)

Total: $0.069 por 1,000 prospectos

Factores de escala:
  × Numero de miles de prospectos
  × Promedio de campos por prospecto / 7 (linea base)
  × Frecuencia de re-normalizacion / 30 dias (linea base)

Ejemplo (5,000 prospectos/mes, 10 campos, re-normalizacion semanal):
  Base: $0.069 × 5 = $0.345
  Ajuste de campos: × (10 / 7) = $0.493
  Ajuste de frecuencia: × (30 / 7) = $2.11/mes
```

### Alertas de Costos

**Alarmas de Facturacion CloudWatch Recomendadas**:

| Volumen | Presupuesto Mensual | Umbral de Alerta |
|--------|----------------|-----------------|
| 1,000 prospectos | $0.07 | $0.10 (margen de seguridad) |
| 10,000 prospectos | $0.70 | $1.00 |
| 100,000 prospectos | $10.00 | $15.00 |

**Template SAM**:
```yaml
CostAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: normalization-cost-spike
    Namespace: AWS/Billing
    MetricName: EstimatedCharges
    Dimensions:
      - Name: ServiceName
        Value: AmazonBedrock
    Statistic: Maximum
    Period: 86400  # 24 horas
    EvaluationPeriods: 1
    Threshold: 1.00  # $1/dia = ~$30/mes
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref AlertTopic
```

## Conclusion

**Este patron es extremadamente rentable**:
- **$0.066 por 1,000 prospectos** (7 campos cada uno)
- **Escalado lineal** (costos predecibles)
- **18,000x mas barato** que entrada manual de datos
- **Se paga solo** en < 1 mes vs desarrollo personalizado

**Principales impulsores de costos**:
1. **Llamadas API Bedrock** (94% del costo total) → optimizar con lotes
2. **Numero de campos** (lineal) → priorizar campos de alto valor
3. **Frecuencia de re-normalizacion** (multiplicativo) → ajustar TTL segun volatilidad de datos

**Prioridades de optimizacion**:
1. **Aumentar tamano de lote** (35% ahorro, riesgo minimo)
2. **Implementar caching** (hasta 95% ahorro para campos de baja cardinalidad)
3. **Reducir frecuencia de re-normalizacion** (75% ahorro para datos estables)

**Conclusion**: A $0.000066 por prospecto, este patron es una decision obvia para cualquier sistema con >100 prospectos/mes.

## Proximos Pasos

- **[README.md](./README.md)**: Vision general del patron e inicio rapido
- **[IMPLEMENTACION.md](./IMPLEMENTACION.md)**: Guia de configuracion paso a paso
- **[VALIDACION-ESTADISTICA.md](./VALIDACION-ESTADISTICA.md)**: Medicion de calidad
- **[LECCIONES-APRENDIDAS.md](./LECCIONES-APRENDIDAS.md)**: Perspectivas de produccion

---

**Ultima Actualizacion**: 24 de Enero, 2026
