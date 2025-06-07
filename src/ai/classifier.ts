import OpenAI from 'openai'
import { config } from '../config/index.js'

let classifierClient: OpenAI | null = null
if (config.ai.apiKey) {
  classifierClient = new OpenAI({ apiKey: config.ai.apiKey })
}

/**
 * Toma un array de mensajes (strings), los une en un solo bloque
 * y llama a OpenAI para clasificarlos en grooming, estafa o sin riesgo.
 */
export async function detectRisk(
  mensajes: string[]
): Promise<{ label: 'GROOMING' | 'ESTAFA' | 'SIN RIESGO'; explanation: string; score?: number }> {
  if (!classifierClient) {
    throw new Error('OpenAI API key is missing. Set OPENAI_API_KEY to enable classification.')
  }

  console.log('mensajes', mensajes)
  
  // Limitamos a los últimos 10 mensajes
  const texto_mensajes = mensajes.slice(-10).join('\n')

  // Preparamos los mensajes para el chat
  const systemPrompt = config.ai.systemPrompt || `
Sos un agente de IA experto en detectar situaciones de riesgo en conversaciones.
Tu tarea es analizar los últimos 10 mensajes y detectar si hay señales de:

1. Grooming (lenguaje sexual, manipulación emocional, pedir fotos, hablar de edad).
2. Posible estafa a mayores (engaños, pedidos de dinero, transferencias, alias, urgencias falsas).
3. Ninguna de las anteriores.

Mensajes:
${texto_mensajes}

Respondé sólo una línea con alguna de estas opciones:
- DETECCIÓN GROOMING: [explicación breve]
- DETECCIÓN ESTAFA: [explicación breve]
- SIN RIESGO
  `.trim()

  const chat = await classifierClient.chat.completions.create({
    model: 'gpt-4o-mini',    // o el modelo que prefieras para clasificación
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: texto_mensajes }
    ]
  })

  const reply = chat.choices[0]?.message?.content?.trim() || ''
  // Parseamos la línea de salida
  const match = reply.match(/DETECCIÓN (GROOMING|ESTAFA): (.+)/i)
  if (match) {
    return {
      label: match[1].toUpperCase() as any,
      explanation: match[2].trim()
    }
  } else if (reply.toUpperCase().includes('SIN RIESGO')) {
    return { label: 'SIN RIESGO', explanation: '' }
  }

  // En caso de formato inesperado, lo marcamos como sin riesgo
  return { label: 'SIN RIESGO', explanation: '' }
}
