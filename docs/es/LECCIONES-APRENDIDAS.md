# Lecciónes Aprendidas de producción

> **Idioma**: [English](../en/LESSONS-LEARNED.md) | [Español](./LECCIONES-APRENDIDAS.md)

**Perspectivas del mundo real de implementar normalización de datos con LLM a escala**

## Contexto

Este patron fue implementado para un sistema de registro de programas educativos en Colombia, procesando **652 prospectos** con **4,280 campos normalizados** en un periodo de 2 semanas. Aqui esta lo que funciónó, lo que no, y lo que haríamos diferente.

## Lo Que funcióno Excepcionalmente Bien

### 1. Claude 3 Haiku Fue el Modelo Perfecto

**Decisión**: Usar Haiku en lugar de Sonnet para ahorro de costos.

**Resultado**:
- **12x más barato** que Sonnet ($0.043 vs $0.48 para 652 prospectos)
- **2-3s de latencia** por lote (aceptable para procesamiento nocturno)
- **Calidad suficiente** para tareas de normalización estructuradas

**Lección**: Para tareas estructuradas (normalización, clasificación, extraccion), Haiku esta subestimado. Guardar Sonnet para tareas creativas/de razonamiento.

**Evidencia**:
```
Costo por prospecto: $0.000066 (6.6 centavos por 1000 prospectos)
Calidad: 99.2% tasa de exito
Satisfacción de stakeholders: 10/10
```

### 2. Pipeline de Post-Procesamiento Fue Esencial

**Decisión**: No confiar en salidas LLM ciegamente - agregar post-procesamiento regex.

**Resultado**:
- Capturó **65.7% de direcciónes** que LLM normalizo correctamente pero post-procesamiento rompio (bug de doble punto)
- Corrigió **capitalización inconsistente** (LLM retorno "bogota" vs "Bogota")
- Hizo cumplir **formatos exactos** (siempre "Cra." con punto, nunca "Cra")

**Lección**: LLMs + reglas deterministicas = lo mejor de ambos mundos.

**Patron de codigo**:
```javascript
// Capa 1: LLM (consciente del contexto)
const llmOutput = await callClaude(prompt);

// Capa 2: Post-procesamiento (deterministico)
const finalOutput = postProcessField(fieldName, llmOutput);
```

### 3. Almacenamiento No Destructivo Fue Crucial

**Decisión**: Almacenar datos normalizados en atributo `normalizedData` separado, preservar originales.

**Resultado**:
- **Revirtió** bug de doble punto sin perdida de datos
- **Pruebas A/B** de diferentes reglas de normalización
- **Comparó** antes/despues para validación de calidad

**Lección**: Siempre preservar datos originales. Almacenamiento es barato, datos perdidos son caros.

**Esquema**:
```javascript
{
  leadId: "abc123",
  nombres: "JUAN CARLOS",        // Original - nunca modificado
  normalizedData: {
    nombres: "Juan Carlos"       // Normalizado - puede regenerarse
  },
  normalizedAt: 1706000000000
}
```

### 4. validación Estadistica Nos Salvo

**Decisión**: Rastrear tasas de mejora por campo con intervalos de confianza.

**Resultado**: Detectó el bug de doble punto que afecto **428 de 652 direcciónes** (65.7%).

**Como funciónó**:
```
Tasa de mejora esperada para direcciónes: 15-25%
Tasa de mejora real: 65.7% ± 3.7%
Z-score: 12.3 (outlier altamente significativo)
Acción: Revision manual por muestreo → bug encontrado → corregido → re-normalizado
```

**Lección**: Los LLMs son probabilísticos. Tratar calidad como proceso estadístico, no como pass/fail binario.

### 5. Procesamiento por Lotes Redujo Costos por 10x

**Decisión**: Enviar 10 prospectos por llamada API Bedrock en lugar de 1 prospecto por llamada.

**Resultado**:
- **Tokens de entrada**: 1,300 por lote vs 13,000 para 10 llamadas individuales (reducción 10x en overhead de prompt)
- **Llamadas API**: 65 llamadas vs 650 llamadas (reducción 10x en overhead de API)
- **Latencia**: 130s vs 1,300s (10x más rápido)

**Lección**: Hacer lotes agresivamente. Los prompts tienen overhead fijo - amortizarlo.

**Evidencia**:
```
Llamadas individuales: 650 llamadas × $0.0004 = $0.26
Llamadas por lotes:     65 llamadas × $0.0004 = $0.026  (10x más barato)
```

## Lo Que No funcióno (y Como Lo Arreglamos)

### 1. normalización Solo-LLM Era Inconsistente

**Problema**: Claude a veces retornaba:
- "Cra. 15" vs "Cra 15" (punto faltante)
- "Bogota" vs "Bogota" (tilde faltante)
- "Juan Carlos" vs "Juan  Carlos" (espacio doble)

**Por que falló**: Temperature=0 es deterministico para misma entrada, pero **varia entre entradas similares**.

**Corrección**: Agregar pipeline de post-procesamiento para hacer cumplir formatos exactos.

**Antes**:
```javascript
// Enfoque solo-LLM
const normalized = await callClaude(prompt);
return normalized;  // Salidas inconsistentes
```

**Despues**:
```javascript
// Enfoque de doble capa
const llmOutput = await callClaude(prompt);
const normalized = postProcessField(fieldName, llmOutput);
return normalized;  // Salidas consistentes
```

### 2. Bug de Doble Punto en Post-Procesamiento

**Problema**: Patron regex `/.replace(/\b(cra)\.?\s*/gi, 'Cra. ')` aplicado a "Cra." ya formateado resulto en "Cra. ."

**Por que falló**: Patron coincidio con "Cra." (con punto) y reemplazo con "Cra. " (agregando otro punto).

**Corrección**: Actualizar regex para verificar punto existente:
```javascript
// Buggy
.replace(/\b(cra)\.?\s*/gi, 'Cra. ')

// Corregido
.replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')  // Coincidir palabra completa
.replace(/\.\s*\./g, '.')  // Red de seguridad: remover dobles puntos
```

**Lección**: Probar post-procesamiento con **datos ya formateados**, no solo datos crudos.

**Caso de prueba agregado**:
```javascript
test('maneja dirección con punto existente (previene bug doble-punto)', () => {
  const response = '{"dirección": "Cra. 80 I # 51 - 09"}';
  const result = parseNormalizationResponse(response);

  expect(result.dirección).toBe('Cra. 80 I # 51 - 09');
  expect(result.dirección).not.toContain('. .');  // ← Asercion critica
});
```

### 3. Casos Borde Faltantes en Mapeos de Ciudades

**Problema**: LLM retorno "Santafe de Bogota" (nombre historico), pero nuestro mapeo solo tenia "Bogota".

**Por que falló**: No anticipo nombres historicos/alternativos de ciudades.

**Corrección**: Expandir mapeos de ciudades con variantes:
```javascript
const CITY_MAPPINGS = {
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'santafe de bogota': 'Bogota D.C.',  // ← Agregado
  'bogota d.c': 'Bogota D.C.',
  'bogota dc': 'Bogota D.C.'
};
```

**Lección**: Construir mapeos iterativamente. Comenzar con variantes comunes, agregar casos borde cuando se encuentren.

### 4. Fallos de Parseo JSON desde LLM

**Problema**: Claude a veces envolvio JSON en bloques de código markdown:
````
```json
{"nombres": "Juan Carlos"}
```
````

**Por que falló**: `JSON.parse()` no puede manejar markdown.

**Corrección**: Agregar limpieza de markdown en parser:
```javascript
export function parseNormalizationResponse(responseText) {
  let jsonStr = responseText;

  // Remover bloques de código markdown si presentes
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Intentar encontrar objeto JSON crudo
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  return JSON.parse(jsonStr);
}
```

**Lección**: Los LLMs no siguen instrucciones perfectamente. Hacer parsers defensivos.

### 5. Cold Starts Eran Lentos (Inicialmente)

**Problema**: Primera invocacion tomaba 5-6 segundos (inicializacion SDK Bedrock).

**Por que falló**: Clientes inicializados dentro de función handler.

**Corrección**: Mover inicializacion de clientes fuera del handler:
```javascript
// ❌ Lento (inicializado en cada invocacion)
export const handler = async (event) => {
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
  // ...
};

// ✅ Rapido (inicializado una vez por contenedor Lambda)
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

export const handler = async (event) => {
  // Cliente ya inicializado
};
```

**Lección**: Siempre inicializar clientes SDK fuera del handler para reutilización de contenedor Lambda.

**Impacto**:
- Cold start: 5s → 2s (60% reducción)
- Invocaciones calientes: 3s → <1s (70% reducción)

## Perspectivas de Ingeniería de Prompts

### Lo Que funcióno

#### 1. Formato de Salida Explicito

- **Bien**:
```
Responde UNICAMENTE con un JSON valido:
{
  "campo1": "valor normalizado"
}
```

- **Mal**:
```
Normalize this data and return the results.
```

**Lección**: Ser explicito sobre formato de salida. Los LLMs siguen patrones, no instrucciones vagas.

#### 2. Ejemplos Sobre Reglas

- **Bien**:
```
Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"
```

- **Mal**:
```
Use standard Colombian address format with proper abbreviations.
```

**Lección**: Ejemplos son mas efectivos que reglas. Mostrar, no decir.

#### 3. Consistencia de Idioma

- **Bien**: Prompt en espanol (datos son espanol)
```
Normaliza los siguientes campos...
```

- **Mal**: Prompt en ingles (datos son espanol)
```
Normalize the following Spanish fields...
```

**Lección**: Coincidir idioma del prompt con idioma de datos para mejor contexto.

### Lo Que No funcióno

#### 1. Pedir al LLM que Retorne String Vacio

- **Mal**:
```
If the field is empty or invalid, return an empty string.
```

**Problema**: LLM frecuentemente retorno `null` u omitio el campo en su lugar.

**Corrección**: Manejar vacio/null en post-procesamiento:
```javascript
if (typeof value === 'string' && value.trim() !== '') {
  normalized[key] = postProcessField(key, value);
}
```

#### 2. Pedir al LLM que Valide Datos

- **Mal**:
```
If the city name is not a valid Colombian city, return the original value.
```

**Problema**: LLM no tiene bases de datos de ciudades comprensivas - invento ciudades invalidas.

**Corrección**: Mover validación a post-procesamiento con lista hardcodeada.

#### 3. Instrucciones Complejas Multi-Paso

- **Mal**:
```
First, check if the value is already normalized. If yes, return it unchanged.
If no, apply the following rules: 1) Capitalize first letter, 2) Remove extra spaces...
```

**Problema**: LLM se confundio con logica compleja.

**Corrección**: Simplificar prompt, mover logica compleja a post-procesamiento.

## Perspectivas operaciónales

### Monitoreo

**Lo que funciónó**:
- **Registro de uso de tokens**: Detectó picos de costos temprano
- **Tasas de exito por campo**: Identifico que campos necesitaban ajuste de prompt
- **Métricas CloudWatch**: Duracion, errores, throttling

**Lo que agregamos despues**:
- **Reportes estadísticos**: Tasas de mejora con intervalos de confianza
- **detección de anomalias**: Alertas cuando tasas se desvian de rangos esperados

**Codigo**:
```javascript
console.log('Uso de tokens:', {
  input: responseBody.usage?.input_tokens || 0,
  output: responseBody.usage?.output_tokens || 0
});

// Alertar si tokens se disparan
if (responseBody.usage?.input_tokens > 2000) {
  console.warn('Alto uso de tokens - investigar tamaño de prompt');
}
```

### Control de Costos

**Lo que funciónó**:
- **Procesamiento por lotes**: Reduccion de costos 10x
- **Re-normalización basada en TTL**: Solo re-normalizar cada 7 dias (vs diario)
- **Max prospectos por ejecución**: Limite de seguridad de 50 prospectos por ejecución

**Lo que deseariamos haber hecho**:
- **Alertas de costos**: Establecer alarma de facturacion CloudWatch a $1/dia
- **Presupuestos de tokens**: Fallar rapido si se acerca al limite de presupuesto

### Estrategia de Pruebas

**Lo que funciónó**:
- **Pruebas unitarias** para generación y parseo de prompts
- **Revision manual por muestreo** de 20 normalizaciónes aleatorias
- **validación estadistica** para capturar bugs sistematicos

**Lo que deberiamos haber hecho mejor**:
- **Pruebas de regresion** con datos reales de producción
- **Base de datos de casos borde**: Mantener lista de entradas problematicas conocidas

**Ejemplo de prueba**:
```javascript
test('maneja datos ya formateados sin cambios', () => {
  const input = {
    nombres: "Juan Carlos",
    dirección: "Cra. 15 # 100 - 25",
    ciudad: "Bogota D.C."
  };

  const result = normalizeLead(input);

  // NO deberia marcar como cambiado si ya formateado
  expect(result.changedFields).toEqual([]);
});
```

## Errores a Evitar

### 1. Confiar en Salidas LLM Ciegamente

- **Error**: `return await callClaude(prompt);`

- **Corrección**: Agregar capa de validación y post-procesamiento.

### 2. No Preservar Datos Originales

- **Error**: Sobrescribir campos originales con valores normalizados.

- **Corrección**: Almacenar datos normalizados separadamente (atributo `normalizedData`).

### 3. Saltarse validación Estadistica

- **Error**: "Las pruebas pasan, despleguemos!"

- **Corrección**: Rastrear tasas de mejora e intervalos de confianza.

### 4. Usar Sonnet Cuando Haiku Es Suficiente

- **Error**: Usar el modelo mas poderoso por defecto.

- **Corrección**: Probar con Haiku primero, actualizar a Sonnet solo si calidad es insuficiente.

### 5. Inicializar Clientes Dentro del Handler

- **Error**: `const client = new BedrockClient()` dentro del handler.

- **Corrección**: Inicializar fuera del handler para reutilización de contenedor.

### 6. No Probar con Datos Ya Formateados

- **Error**: Solo probar con datos desordenados ("CRA 15 NO 100 25").

- **Corrección**: Probar con datos limpios ("Cra. 15 # 100 - 25") para capturar sobre-normalización.

### 7. Hardcodear Configuración en Lambda

- **Error**: Listas de campos, tamaños de lote en variables de entorno.

- **Corrección**: Almacenar en DynamoDB para cambios de config sin despliegue.

## Métricas Que Importaron

### Métricas de Calidad

| Métrica | Objetivo | Real | Acción si No Alcanzado |
|--------|--------|--------|------------------|
| **Cobertura** | >95% | 99.2% | Investigar fallós, mejorar manejo de errores |
| **Tasa de Mejora** | 60-80% | 70.4% | Muy bajo = prompt no agresivo; muy alto = sobre-normalizando |
| **Tasa de Error** | <5% | 0.8% | Depurar fallós, agregar casos borde a pruebas |

### Métricas de Costos

| Métrica | Objetivo | Real | Acción si Excedido |
|--------|--------|--------|-------------------|
| **Costo por prospecto** | <$0.001 | $0.000066 | Cambiar a Haiku, aumentar tamaño de lote |
| **Costo mensual** | <$1 | $0.043 | En camino (proyectado $1.29/mes para 30K prospectos) |

### Métricas operaciónales

| Métrica | Objetivo | Real | Acción si No Alcanzado |
|--------|--------|--------|------------------|
| **Duracion** | <5 min | 3 min | Reducir tamaño de lote o max prospectos por ejecución |
| **Cold start** | <3s | 2s | Aceptable para trabajo batch nocturno |
| **Fallos** | 0 | 0 | Logica de reintentos, manejo de errores |

## Recomendaciones para Otros

### Comenzando

1. **Empezar pequeno**: Probar con 50-100 registros antes de despliegue completo
2. **Usar Haiku**: Actualizar a Sonnet solo si calidad es insuficiente
3. **Hacer lotes agresivamente**: 10-20 registros por llamada API
4. **Preservar originales**: Almacenamiento no destructivo es obligatorio
5. **Agregar post-procesamiento**: No confiar en salidas LLM ciegamente

### Escalando

1. **Monitorear costos**: Establecer alarmas de facturacion CloudWatch
2. **Rastrear estadisticas**: Tasas de mejora con intervalos de confianza
3. **Detectar anomalias**: Alertar cuando tasas se desvian de esperado
4. **Versionar prompts**: Rastrear cambios a prompts en git
5. **Pruebas A/B**: Comparar calidad de normalización antes/despues de cambios

### Yendo a producción

1. **Agregar logging comprensivo**: Uso de tokens, tasas de exito por campo, errores
2. **Configurar alertas**: Picos de costos, deriva de calidad, fallós
3. **Documentar casos borde**: Mantener lista de entradas problematicas conocidas
4. **Planear re-normalización**: Tener estrategia para actualizaciónes de prompt/modelo
5. **Comunicar con stakeholders**: Usar intervalos de confianza en reportes

## Sorpresas y Alegrias

### Sorpresas Positivas

1. **Haiku fue mejor de lo esperado**: 99.2% tasa de exito por $0.043
2. **validación estadistica capturo bugs**: Bug de doble punto habria pasado desapercibido
3. **Almacenamiento no destructivo valio la pena**: Revirtió bug sin perdida de datos
4. **Procesamiento por lotes fue facil**: Mejora 10x en costo/velocidad con código mínimo

### Sorpresas Negativas

1. **Bugs de post-procesamiento fueron escurridizos**: Bug de doble punto afecto 65.7% de datos silenciosamente
2. **Consistencia LLM no fue perfecta**: Incluso a temp=0, necesito validación
3. **Casos borde emergieron lentamente**: Variantes de ciudades/instituciones aparecieron durante semanas

## Pensamientos Finales

**Lo que mantendriamos**:
- Claude 3 Haiku (balance perfecto costo/calidad)
- Pipeline de post-procesamiento (esencial para consistencia)
- validación estadistica (capturo bugs criticos)
- Almacenamiento no destructivo (habilito experimentacion)
- Procesamiento por lotes (ganancia de eficiencia 10x)

**Lo que cambiariamos**:
- Probar con datos ya formateados mas temprano (habria capturado bug de doble punto)
- Establecer alertas de costos desde dia 1 (tranquilidad)
- Construir base de datos de casos borde proactivamente (no reactivamente)

**Conclusión**: Este patron funcióna excepcionalmente bien para normalización de datos estructurados. El enfoque de doble capa (LLM + post-procesamiento) logra **99.2% de calidad** a **$0.000066 por registro** - un ratio costo/calidad dificil de superar.

## Próximos Pasos

- **[ANALISIS-COSTOS.md](./ANALISIS-COSTOS.md)**: Desglose detallado de costos y estrategias de optimización
- **[README.md](./README.md)**: Vision general del patron e inicio rapido

---

**Última Actualización**: 24 de Enero, 2026
