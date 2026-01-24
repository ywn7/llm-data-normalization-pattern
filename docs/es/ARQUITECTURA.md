# Arquitectura en Profundidad

> **Idioma**: [English](../en/ARCHITECTURE.md) | [Español](./ARQUITECTURA.md)

**Patrón ETL de Normalización de Datos con LLM**

## Visión General del Sistema

Este patrón implementa un pipeline ETL programado que normaliza datos enviados por usuarios usando Claude 3 Haiku a través de AWS Bedrock. La arquitectura prioriza eficiencia de costos, integridad de datos y simplicidad operaciónal.

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Arquitectura Cloud AWS                          │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   Regla EventBridge  │  Disparador programado
│   Diario a 2 AM COT  │  (cron: 0 7 * * ? *)
└──────────┬───────────┘
           │ Invoca
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Lambda: normalize-leads                             │
│                    Runtime: Node.js 22.x                               │
│                    Memoria: 512 MB | Timeout: 300s                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  FASE 1: Carga de Datos                                          │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ 1. Cargar config de DynamoDB (si existe)                   │  │  │
│  │  │    - fieldsToNormalize: ["nombres", "ciudad", ...]         │  │  │
│  │  │    - batchSize: 10                                         │  │  │
│  │  │    - normalizationTTLDays: 7                               │  │  │
│  │  │ 2. Consultar prospectos que necesitan normalización:       │  │  │
│  │  │    - WHERE normalizedAt IS NULL OR                         │  │  │
│  │  │    - WHERE normalizedAt < (ahora - TTL)                    │  │  │
│  │  │ 3. Limitar a maxLeadsPerRun (default: 50)                  │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  FASE 2: Procesamiento por Lotes (ciclo)                          │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Para cada lote de N prospectos (default N=10):             │  │  │
│  │  │                                                             │  │  │
│  │  │ 4. Generar prompt (prompts.js)                             │  │  │
│  │  │    - Reglas de normalización por campo                     │  │  │
│  │  │    - Ejemplos para contexto                                │  │  │
│  │  │    - Estructura JSON con campos del prospecto              │  │  │
│  │  │                                                             │  │  │
│  │  │ 5. Llamar AWS Bedrock                              ────────┐ │  │  │
│  │  │    - Modelo: Claude 3 Haiku                                │ │  │  │
│  │  │    - Temperature: 0 (determinístico)                       │ │  │  │
│  │  │    - Max tokens: 1000                                      │ │  │  │
│  │  │    - Devuelve JSON con campos normalizados                 │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 6. Parsear respuesta (prompts.js)                          │ │  │  │
│  │  │    - Extraer JSON de bloques markdown                      │ │  │  │
│  │  │    - Validar estructura                                    │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 7. Pipeline de post-procesamiento ◄─── CRÍTICO             │ │  │  │
│  │  │    - normalizeAddress() - Corregir abreviaciones           │ │  │  │
│  │  │    - normalizeEducationLevel() - Estandarizar              │ │  │  │
│  │  │    - capitalizeWords() - Formatear nombres                 │ │  │  │
│  │  │    - Mapeos de ciudades/instituciones                      │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 8. Actualizar DynamoDB                                     │ │  │  │
│  │  │    - Almacenar en atributo normalizedData                  │ │  │  │
│  │  │    - Establecer timestamp normalizedAt                     │ │  │  │
│  │  │    - Actualizar updatedAt                                  │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 9. Esperar 500ms (limitación de tasa)                      │ │  │  │
│  │  └─────────────────────────────────────────────────────────┬──┘  │  │
│  │                                                              │     │  │
│  │  FASE 3: Reporteo                                            │     │  │
│  │  ┌──────────────────────────────────────────────────────────▼──┐  │  │
│  │  │ 10. Calcular métricas:                                      │  │  │
│  │  │     - Prospectos procesados                                 │  │  │
│  │  │     - Campos normalizados                                   │  │  │
│  │  │     - Errores encontrados                                   │  │  │
│  │  │     - Duración                                              │  │  │
│  │  │ 11. Registrar en CloudWatch                                 │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──┬─────────────────────────────────────────────────────┬──────────────┘
   │                                                      │
   │ Lee/Escribe                                          │ Llamadas API
   ▼                                                      ▼
┌─────────────────────────────┐            ┌──────────────────────────┐
│      Tablas DynamoDB        │            │     AWS Bedrock          │
├─────────────────────────────┤            ├──────────────────────────┤
│ awsrestart-leads (principal)│            │ Claude 3 Haiku           │
│ ┌─────────────────────────┐ │            │ Model ID:                │
│ │ leadId (PK)             │ │            │ anthropic.claude-3-      │
│ │ nombres (original)      │ │            │ haiku-20240307-v1:0      │
│ │ apellidos (original)    │ │            │                          │
│ │ ciudad (original)       │ │            │ Invocación:              │
│ │ ...                     │ │            │ - Input: ~1,300 tokens   │
│ │ normalizedAt (timestamp)│ │            │ - Output: ~80 tokens     │
│ │ normalizedData: {       │ │            │ - Latencia: ~2-4s        │
│ │   nombres: "...",       │ │            │                          │
│ │   apellidos: "...",     │ │            │ Costo por llamada:       │
│ │   ciudad: "..."         │ │            │ ~$0.0004                 │
│ │ }                       │ │            └──────────────────────────┘
│ └─────────────────────────┘ │
│                             │
│ awsrestart-normalization-   │
│ config (opcional)           │
│ ┌─────────────────────────┐ │
│ │ configId (PK)           │ │
│ │ enabled: true           │ │
│ │ fieldsToNormalize: []   │ │
│ │ batchSize: 10           │ │
│ │ maxLeadsPerRun: 50      │ │
│ │ normalizationTTLDays: 7 │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘

┌─────────────────────────────┐
│    CloudWatch Logs          │
├─────────────────────────────┤
│ Log Group:                  │
│ /aws/lambda/awsrestart-     │
│ normalize-leads             │
│                             │
│ Métricas:                   │
│ - Uso de tokens por llamada │
│ - Duración de normalización │
│ - Tasas de error            │
│ - Estadísticas de lotes     │
└─────────────────────────────┘
```

## Detalles de Componentes

### 1. Regla Programada de EventBridge

**Nombre del Recurso**: `awsrestart-daily-normalization`

**Configuración**:
```yaml
Schedule: cron(0 7 * * ? *)  # 7 AM UTC = 2 AM COT
Enabled: true
Target: NormalizeLeadsFunction
```

**Por qué diariamente a las 2 AM COT?**
- Ventana de bajo tráfico (carga mínima en base de datos)
- Datos frescos disponibles para reportes matutinos a las 8 AM
- Alinea con programación de exportación (8 AM COT = 1 PM UTC)
- Permite revisión manual antes del horario laboral

**Disparadores alternativos**:
- **Manual via API**: `POST /admin/normalize-leads` (autenticado con Cognito)
- **Invocación directa**: `aws lambda invoke --function-name awsrestart-normalize-leads`
- **Bajo demanda**: Establecer `forceAll=true` para re-normalizar todo el dataset

### 2. Función Lambda: normalize-leads

**Configuración de Runtime**:
```javascript
{
  Runtime: "nodejs22.x",
  MemorySize: 512,           // Balanceado para SDK Bedrock + parseo JSON
  Timeout: 300,              // 5 min para lotes grandes (50 prospectos × 10s cada uno)
  Architecture: "x86_64",    // Compatibilidad SDK Bedrock
  ReservedConcurrency: 1     // Evitar límites de tasa Bedrock
}
```

**Variables de Entorno**:
```javascript
{
  LEADS_TABLE: "awsrestart-leads",
  CONFIG_TABLE: "awsrestart-normalization-config",
  BEDROCK_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0",
  BATCH_SIZE: "10",
  NORMALIZATION_TTL_DAYS: "7",
  MAX_LEADS_PER_RUN: "50",
  AWS_REGION: "us-east-1"
}
```

**Permisos IAM**:
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:UpdateItem",
    "dynamodb:Scan"
  ],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/awsrestart-leads",
    "arn:aws:dynamodb:*:*:table/awsrestart-normalization-config"
  ]
},
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
}
```

### 3. DynamoDB: awsrestart-leads

**Esquema de Tabla**:
```javascript
{
  TableName: "awsrestart-leads",
  BillingMode: "PAY_PER_REQUEST",  // Eficiente en costos para carga variable
  KeySchema: [
    { AttributeName: "leadId", KeyType: "HASH" }
  ],
  Attributes: {
    // Campos originales (entrada usuario - nunca modificados)
    nombres: String,
    apellidos: String,
    dirección: String,
    ciudad: String,
    nivelEducativo: String,
    ocupacionActual: String,
    empresa: String,

    // Metadatos de normalización
    normalizedAt: Number,     // Timestamp Unix
    updatedAt: Number,

    // Datos normalizados (atributo separado)
    normalizedData: {
      nombres: String,        // "Juan Carlos" vs "JUAN CARLOS"
      apellidos: String,      // "Perez Garcia" vs "PEREZ GARCIA"
      dirección: String,      // "Cra. 15 # 100 - 25" vs "CRA 15 NO 100 25"
      ciudad: String,         // "Bogota D.C." vs "bogota"
      nivelEducativo: String, // "Profesional" vs "profesional universitario"
      ocupacionActual: String,// "Ingeniero de Sistemas" vs "Ing. Sistemas"
      empresa: String         // "SENA" vs "sena"
    }
  }
}
```

**Por qué un atributo `normalizedData` separado?**
- **Cumplimiento de auditoría**: Datos originales preservados para requisitos legales/contractuales (Ley 1581 de 2012)
- **Capacidad de reversión**: Puede descartar datos normalizados si se detectan bugs
- **Analítica de comparación**: Rastrear calidad de normalización comparando original vs. normalizado
- **Flexibilidad futura**: Puede re-normalizar con prompts mejorados sin perder originales

**Overhead de almacenamiento**: ~2-3 KB por prospecto para datos normalizados (aceptable para miles de registros)

### 4. DynamoDB: awsrestart-normalization-config (Opcional)

**Esquema de Tabla**:
```javascript
{
  TableName: "awsrestart-normalization-config",
  BillingMode: "PAY_PER_REQUEST",
  KeySchema: [
    { AttributeName: "configId", KeyType: "HASH" }
  ]
}
```

**Documento de Configuración**:
```javascript
{
  configId: "normalization-settings",
  enabled: true,                    // Interruptor global on/off
  fieldsToNormalize: [
    "nombres",
    "apellidos",
    "dirección",
    "ciudad",
    "nivelEducativo",
    "ocupacionActual",
    "empresa"
  ],
  batchSize: 10,                    // Prospectos por llamada Bedrock
  maxLeadsPerRun: 50,               // Límite de seguridad por ejecución
  normalizationTTLDays: 7           // Re-normalizar después de 7 días
}
```

**Por qué config en DynamoDB en lugar de variables de entorno?**
- **Sin redespliegue**: Actualizar config via API/Consola sin redesplegar Lambda
- **Pista de auditoría**: DynamoDB rastrea quién cambió qué y cuándo
- **actualizaciónes atómicas**: Más seguro que editar configuración Lambda
- **Fallback**: Si la tabla no existe, Lambda usa valores predeterminados

### 5. AWS Bedrock: Claude 3 Haiku

**Justificación de Selección de Modelo**:

| Modelo | Costo (1M tokens) | Latencia | Calidad | Caso de Uso |
|-------|------------------|---------|---------|----------|
| Claude 3.5 Sonnet | $15 | ~5s | Excelente | Razonamiento complejo, escritura creativa |
| Claude 3 Haiku | $1.25 | ~2s | Buena | **Normalización de datos, clasificación** ✓ |
| GPT-4o-mini | $0.60 | ~3s | Buena | Alternativa si no hay Bedrock |

**Por qué Haiku sobre Sonnet?**
- **12x más barato**: $0.04 vs $0.48 para 652 prospectos
- **2x más rápido**: ~2s vs ~5s por lote
- **Calidad suficiente**: La normalización es estructurada, no creativa
- **Determinístico a temp=0**: Salidas consistentes para mismas entradas

**Llamada API Bedrock**:
```javascript
{
  modelId: "anthropic.claude-3-haiku-20240307-v1:0",
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1000,
    temperature: 0,          // Salidas determinísticas
    messages: [
      {
        role: "user",
        content: prompt      // Ver implementación.md para estructura de prompt
      }
    ]
  })
}
```

**Uso de Tokens** (por lote de 10 prospectos):
- **Input**: ~1,300 tokens (prompt + datos)
- **Output**: ~80 tokens (respuesta JSON)
- **Total**: ~1,380 tokens × $0.00025/1K input + $0.00125/1K output = **$0.0004/lote**

**Límites de Tasa**:
- Por defecto: 10 solicitudes/segundo por cuenta (más que suficiente)
- Mitigación: 500ms de espera entre lotes
- Concurrencia reservada: 1 (previene invocaciones Lambda paralelas)

## Diagrama de Secuencia de Flujo de Datos

```
Usuario          EventBridge      Lambda             DynamoDB         Bedrock
 │                  │               │                   │              │
 │                  │  1. Disparar  │                   │              │
 │                  │─(2 AM COT)───>│                   │              │
 │                  │               │                   │              │
 │                  │               │  2. Cargar config │              │
 │                  │               │──────────────────>│              │
 │                  │               │<──────────────────│              │
 │                  │               │  {enabled: true}  │              │
 │                  │               │                   │              │
 │                  │               │  3. Consultar     │              │
 │                  │               │   prospectos      │              │
 │                  │               │   (normalizedAt   │              │
 │                  │               │    < corte)       │              │
 │                  │               │──────────────────>│              │
 │                  │               │<──────────────────│              │
 │                  │               │  [50 prospectos]  │              │
 │                  │               │                   │              │
 │                  │               │─┐                 │              │
 │                  │               │ │ 4. Para cada    │              │
 │                  │               │ │    lote (10)    │              │
 │                  │               │<┘                 │              │
 │                  │               │                   │              │
 │                  │               │  5. Generar       │              │
 │                  │               │     prompt        │              │
 │                  │               │                   │              │
 │                  │               │  6. Invocar Claude│              │
 │                  │               │──────────────────────────────────>│
 │                  │               │                   │  Haiku       │
 │                  │               │                   │  procesa     │
 │                  │               │<──────────────────────────────────│
 │                  │               │  {JSON normalizado}              │
 │                  │               │                   │              │
 │                  │               │  7. Post-procesar │              │
 │                  │               │     (correcciónes │              │
 │                  │               │      regex)       │              │
 │                  │               │                   │              │
 │                  │               │  8. Actualizar    │              │
 │                  │               │     prospectos    │              │
 │                  │               │──────────────────>│              │
 │                  │               │  SET normalizedAt │              │
 │                  │               │      normalizedData              │
 │                  │               │<──────────────────│              │
 │                  │               │                   │              │
 │                  │               │  9. Esperar 500ms │              │
 │                  │               │                   │              │
 │                  │               │  10. Repetir para │              │
 │                  │               │      siguiente    │              │
 │                  │               │      lote         │              │
 │                  │               │                   │              │
 │                  │               │ 11. Registrar     │              │
 │                  │               │     metricas en   │              │
 │                  │               │     CloudWatch    │              │
 │                  │               │                   │              │
 │                  │<──(exito)────│                   │              │
```

## Consideraciones de Escalado

### Configuración Actual (Pequeña Escala)

- **Volumen**: 500-1,000 prospectos/mes
- **Frecuencia**: Diaria a las 2 AM COT
- **Tamaño de lote**: 10 prospectos/lote
- **Máximo por ejecución**: 50 prospectos
- **Duración**: ~2-3 minutos para 50 prospectos

### Escalando a 10,000 Prospectos/Mes

**Opción 1: Aumentar tamaño de lote**
```javascript
BATCH_SIZE: 20              // 2x rendimiento
MAX_LEADS_PER_RUN: 200      // 4x rendimiento
Timeout: 600                // 10 minutos
```
- **Pros**: Cambios de código mínimos, eficiente en costos
- **Contras**: Mayor uso de memoria, cold starts más largos
- **Impacto en costos**: Ninguno (mismos tokens totales)

**Opción 2: Lotes paralelos**
```javascript
ReservedConcurrency: 5      // 5 Lambdas concurrentes
BATCH_SIZE: 10
MAX_LEADS_PER_RUN: 50
```
- **Pros**: 5x rendimiento, procesamiento más rápido
- **Contras**: Límites de tasa Bedrock (10 req/s), mayores costos
- **Impacto en costos**: Ninguno (mismos tokens totales)

**Opción 3: Normalización en tiempo real**
```javascript
// Disparar Lambda en DynamoDB Streams (nuevos prospectos)
EventSourceMapping:
  Type: DynamoDB
  Stream: awsrestart-leads
  BatchSize: 10
```
- **Pros**: Normalización inmediata, sin demora diaria
- **Contras**: Mayores invocaciones Lambda, agrega latencia al envío de formulario
- **Impacto en costos**: +100% invocaciones Lambda, mismos costos Bedrock

### Escalando a 100,000 Prospectos/Mes

A esta escala, considerar:
- **Caching**: Almacenar valores normalizados en ElastiCache/DynamoDB DAX
- **Procesamiento por lotes**: Cola SQS + Step Functions para orquestación
- **Alternativas a Bedrock**: Modelo fine-tuned o LLM local (Llama 3)
- **Optimización de costos**: Cambiar a API OpenAI (GPT-4o-mini a $0.60/1M tokens)

## Alta Disponibilidad y Tolerancia a Fallos

### Estrategia de Manejo de Errores

**Fallos de API Bedrock**:
```javascript
try {
  const response = await bedrockClient.send(command);
} catch (error) {
  if (error.name === 'ThrottlingException') {
    // Backoff exponencial: reintentar después de 1s, 2s, 4s
    await sleep(retryDelay);
    retryDelay *= 2;
  } else if (error.name === 'ModelTimeoutException') {
    // Omitir lote, registrar para revisión manual
    console.error(`Timeout de lote: ${leadIds}`);
  } else {
    // Error fatal - fallar ejecución Lambda
    throw error;
  }
}
```

**Fallos de DynamoDB**:
- **Throttling**: Manejado por reintentos automáticos del AWS SDK (backoff exponencial)
- **Item no encontrado**: Esperado - prospecto puede haber sido eliminado, omitir silenciosamente
- **Conflictos de actualización**: Usar actualizaciónes condicionales para prevenir sobrescrituras

**Timeouts de Lambda**:
- **Actual**: 300s (5 min) - suficiente para 50 prospectos
- **Mitigación**: Reducir `maxLeadsPerRun` a 25 si se acerca al timeout
- **Monitoreo**: Alarma CloudWatch si duración > 240s

### Idempotencia

**Problema**: EventBridge puede invocar Lambda múltiples veces para el mismo horario.

**Solución**: Usar timestamp `normalizedAt` para prevenir procesamiento redundante.

```javascript
// Solo normalizar si:
// 1. Nunca normalizado (normalizedAt es null), O
// 2. Normalizado hace más de TTL días

const cutoffTime = Date.now() - (TTL_DAYS * 24 * 60 * 60 * 1000);

const leadsToNormalize = allLeads.filter(lead => {
  return !lead.normalizedAt || lead.normalizedAt < cutoffTime;
});
```

**Re-normalización manual**:
```javascript
// Forzar re-normalización via API
POST /admin/normalize-leads?forceAll=true
```

### Monitoreo y Alertas

**Métricas CloudWatch**:
- `LeadsProcessed`: Conteo de prospectos normalizados exitosamente
- `NormalizationErrors`: Conteo de fallos
- `Duration`: Tiempo de ejecución Lambda
- `TokenUsage`: Tokens de entrada + salida por lote

**Alarmas CloudWatch**:
```yaml
Alarm: NormalizationFailureRate
Condition: Errors > 5 en 1 hora
Action: Notificación SNS a email admin

Alarm: NormalizationDuration
Condition: Duration > 240s
Action: Notificación SNS (acercándose al timeout)

Alarm: BedrockCostSpike
Condition: EstimatedCharges > $5/día
Action: Notificación SNS + deshabilitar normalización
```

## Consideraciones de Seguridad

### IAM Menor Privilegio

**Rol de Ejecución Lambda**:
```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/awsrestart-leads"
    },
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/awsrestart-normalize-leads:*"
    }
  ]
}
```

**Sin permisos para**:
- Eliminar items de DynamoDB
- Invocar otras Lambdas
- Acceder a buckets S3
- Modificar roles IAM

### Privacidad de Datos

**Manejo de PII**:
- PII original (nombres, direcciónes) nunca enviada a logs de CloudWatch
- Solo `leadId` y nombres de campos registrados para depuración
- Llamadas API Bedrock encriptadas en tránsito (TLS 1.2+)
- Sin retención de datos por Bedrock (según política de Privacidad de Datos de AWS Bedrock)

**Cumplimiento**:
- **Ley 1581 de 2012 (Colombia)**: Datos originales preservados, pista de auditoría via timestamps
- **GDPR (si aplica)**: Derecho al olvido - eliminar item completo del prospecto (original + normalizado)

### Gestión de Secretos

**Claves API**: No requeridas - Bedrock usa autenticación IAM

**Configuración**: Almacenada en DynamoDB (encriptada en reposo por defecto)

**Variables de Entorno**: Sin datos sensibles - solo nombres de tablas y valores de configuración

## Optimización de Rendimiento

### Mitigación de Cold Start

**Cold start actual**: ~2-3 segundos (inicialización SDK Bedrock)

**Optimización**:
```javascript
// Inicializar clientes fuera del handler (reutilización de contenedor Lambda)
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  // Clientes ya inicializados
};
```

**Concurrencia reservada**: 1 (mantiene 1 instancia Lambda caliente)

### Reducción de Latencia

**Procesamiento por lotes**: 10 prospectos/llamada reduce overhead de API por 10x vs. llamadas individuales

**actualizaciónes DynamoDB paralelas**: Usar `Promise.all()` para actualizar prospectos concurrentemente
```javascript
await Promise.all(
  batch.map(lead => docClient.send(new UpdateCommand({...})))
);
```

**Optimización de tokens**: Prompt mínimo (sin ejemplos verbosos) reduce tokens de entrada en 30%

### Optimización de Costos

**Usar Haiku, no Sonnet**: 12x más barato para la misma tarea

**Tamaño de lote**: Lotes más grandes amortizan overhead del prompt (1 prompt para 10 prospectos vs. 10 prompts)

**Re-normalización basada en TTL**: Solo re-normalizar cada 7 días (vs. diario) reduce costos por 7x

**Validación por muestreo**: Validar manualmente 5% de normalizaciónes en lugar de 100%

## Próximos Pasos

- **[implementación.md](./implementación.md)**: Recorrido de código paso a paso
- **[validación-ESTADISTICA.md](./validación-ESTADISTICA.md)**: Métricas de calidad y detección de bugs
- **[LECCIONES-APRENDIDAS.md](./LECCIONES-APRENDIDAS.md)**: Perspectivas de producción

---

**Última Actualización**: 24 de Enero, 2026
