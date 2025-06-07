// src/messageHandler.ts

import { BaileysEventMap, WASocket, WAMessage } from 'baileys'
import { config } from '../config/index.js'
import { detectRisk } from '../ai/classifier.js'
import { getLastMessages } from '../ai/history.js'
import { createLogger } from '../logger/index.js'
import { supabase } from '../config/supabase.js'

const logger = createLogger('MessageHandler')

/**
 * Configura el manejador de mensajes entrantes para el socket de Baileys.
 * Escucha el evento 'messages.upsert' y procesa los mensajes nuevos que no sean del propio bot.
 */
export function setupMessageHandler(sock: WASocket) {
  sock.ev.on(
    'messages.upsert',
    async ({ messages, type }: BaileysEventMap['messages.upsert']) => {
      if (type !== 'notify') return

      for (const message of messages) {
        if (!message.message) continue
        if (message.key.fromMe) continue

        await handleMessage(sock, message)
      }
    }
  )
}

/**
 * Procesa un mensaje individual recibido por WhatsApp.
 * Incluye:
 *  1) Recuperar el historial,
 *  2) Detectar riesgos (grooming/estafa),
 *  3) Guardar alertas o mensajes en Supabase,
 *  4) Generar respuesta IA o fallback.
 */
async function handleMessage(sock: WASocket, message: WAMessage) {
  try {
    const remoteJid = message.key.remoteJid
    if (!remoteJid) return

    // Extraer el texto del mensaje
    const textContent =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      ''
    if (!textContent) return

    logger.info('Message received', {
      from: remoteJid,
      text: textContent,
      messageId: message.key.id
    })

    // 1) Recuperar los últimos mensajes del chat
    let chatHistory = await getLastMessages(remoteJid, 10)
    chatHistory.push(textContent)

    // 2) Detectar riesgo
    const { label, explanation } = await detectRisk(chatHistory)
    logger.info('Risk detection', { label, explanation })

    // 3) Si detecta grooming o estafa, registrar alerta y notificar
    if (label !== 'SIN RIESGO') {
      await supabase.from('alerts').insert([{
        from: remoteJid,
        message_id: message.key.id,
        label,
        explanation,
        text: textContent
      }])

      await sock.sendMessage(config.bot.recipientJid, {
        text: `⚠️ *Alerta de ${label}*\n${explanation}\n\nMensaje:\n"${textContent}"`
      })
      return
    }

    // 4) Guardar mensaje en tabla 'messages'
    const { error: insertError } = await supabase.from('messages').insert([{
      from: remoteJid,
      text: textContent,
      message_id: message.key.id,
      raw: message
    }])
    if (insertError) {
      logger.error('Error guardando mensaje en Supabase', insertError)
    }

  } catch (err) {
    logger.error('Error handling message', err, {
      messageId: message.key.id,
      from: message.key.remoteJid
    })
  }
}
