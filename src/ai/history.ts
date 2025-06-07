// ai/history.ts
import { supabase } from '../config/supabase.js'

/**
 * Recupera los últimos N mensajes de un mismo chat desde Supabase.
 * @param remoteJid Identificador del chat (p.ej. número de WhatsApp).
 * @param limit Cantidad de mensajes a traer (por defecto 10).
 * @returns Array de textos, ordenados de más antiguo a más reciente.
 */
export async function getLastMessages(
  remoteJid: string,
  limit = 10
): Promise<string[]> {
  // Consulta a Supabase: filtra por el campo "from", ordena por created_at descendente y limita.
  const { data, error } = await supabase
    .from('messages')
    .select('text')
    .eq('from', remoteJid)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching last messages', error)
    throw error
  }

  // Extraemos sólo el texto y revertimos para tener orden cronológico ascendente
  const textos = data.map((row: { text: string }) => row.text)
  return textos.reverse()
}
