/**
 * Uso:
 *   npx tsx webview-form.ts [private <num> | group <jid> | group-name <nome>]
 */
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

import { createSqliteStore } from '@zapo-js/store-sqlite'

import { ConsoleLogger, createStore, delay, parsePhoneJid, proto, WaClient } from 'zapo-js'

import { createRunLogger, formatResposta } from './run-logger.js'

const require = createRequire(import.meta.url)
const qrcode = require('qrcode-terminal') as {
    generate: (text: string, opts: { small: boolean }) => void
}

const MAX_RECONNECT_ATTEMPTS = 10
const DEFAULT_PRIVATE = '558781148453'

const WEBVIEW_URL = process.env.WEBVIEW_URL ?? 'https://web.takeflow.com.br/'
const WEBVIEW_TEXT = process.env.WEBVIEW_TEXT ?? 'Abrir'
const WEBVIEW_INTERACTION = (process.env.WEBVIEW_INTERACTION ?? 'true') !== 'false'

type Alvo = { jid: string; descricao: string } | { groupName: string; descricao: string }
function resolveTarget(): Alvo {
    const kind = (process.argv[2] ?? 'private').toLowerCase()
    const raw = process.argv[3]
    if (kind === 'group' || kind === 'grupo') {
        if (!raw) {
            console.error('uso: npx tsx webview-form.ts group <jid@g.us>')
            process.exit(1)
        }
        const jid = raw.includes('@') ? raw : `${raw}@g.us`
        return { jid, descricao: `grupo ${jid}` }
    }
    if (kind === 'group-name' || kind === 'grupo-nome') {
        const name = process.argv.slice(3).join(' ').trim()
        if (!name) {
            console.error('uso: npx tsx webview-form.ts group-name <nome do grupo>')
            process.exit(1)
        }
        return { groupName: name, descricao: `grupo "${name}"` }
    }
    if (kind !== 'private' && kind !== 'privado') {
        console.error(`tipo de alvo inválido: "${kind}". Use "private", "group" ou "group-name".`)
        process.exit(1)
    }
    const jid = parsePhoneJid(raw ?? DEFAULT_PRIVATE)
    return { jid, descricao: `contato privado ${jid}` }
}

function botaoWebview(): { name: string; buttonParamsJson: string } {
    return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
            display_text: WEBVIEW_TEXT,
            url: WEBVIEW_URL,
            merchant_url: WEBVIEW_URL,
            webview_presentation: 'full',
            webview_interaction: WEBVIEW_INTERACTION
        })
    }
}

function mensagem(): proto.IMessage {
    return {
        interactiveMessage: {
            body: { text: 'Toque para abrir o formulário aqui dentro do WhatsApp 👇' },
            footer: { text: 'enviado via zapo' },
            nativeFlowMessage: { messageVersion: 1, buttons: [botaoWebview()] }
        }
    }
}

function unwrap(m: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
    return (
        m?.ephemeralMessage?.message ??
        m?.viewOnceMessage?.message ??
        m?.viewOnceMessageV2?.message ??
        m?.documentWithCaptionMessage?.message ??
        m
    )
}
function logResposta(
    log: (msg: string) => void,
    jid: string,
    participant: string | null | undefined,
    message: proto.IMessage | null | undefined
): void {
    const m = unwrap(message)
    const nf = m?.interactiveResponseMessage?.nativeFlowResponseMessage
    if (nf) log(formatResposta(jid, participant, nf.name, nf.paramsJson))
}

async function main(): Promise<void> {
    const alvo = resolveTarget()
    const rlog = createRunLogger('webview-form')
    rlog.log(`[webview] alvo: ${alvo.descricao} url=${WEBVIEW_URL} interaction=${WEBVIEW_INTERACTION} (log: ${rlog.file})`)

    const authPath = resolve(process.cwd(), '.auth', 'buttons-test.sqlite')
    await mkdir(dirname(authPath), { recursive: true })

    const store = createStore({
        backends: { sqlite: createSqliteStore({ path: authPath, driver: 'auto' }) },
        providers: {
            auth: 'sqlite',
            signal: 'sqlite',
            preKey: 'sqlite',
            session: 'sqlite',
            identity: 'sqlite',
            senderKey: 'sqlite',
            appState: 'sqlite',
            privacyToken: 'sqlite',
            messages: 'sqlite',
            threads: 'sqlite',
            contacts: 'sqlite'
        }
    })

    const client = new WaClient({ store, sessionId: 'buttons-test' }, new ConsoleLogger('info'))
    let reconnectAttempt = 0
    let enviado = false

    async function reconnect(): Promise<void> {
        if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            console.error(`[reconnect] desistindo após ${reconnectAttempt} tentativas`)
            process.exit(1)
        }
        const delayMs = Math.min(30_000, 1_000 * 2 ** reconnectAttempt)
        reconnectAttempt += 1
        console.log(`[reconnect] tentativa ${reconnectAttempt} em ${delayMs}ms`)
        await delay(delayMs)
        try {
            await client.connect()
        } catch (error) {
            console.error('[reconnect] falhou:', error)
            void reconnect()
        }
    }

    async function resolverJid(): Promise<string> {
        if ('jid' in alvo) return alvo.jid
        const grupos = await client.group.queryAllGroups()
        const nomeAlvo = alvo.groupName.toLowerCase()
        const achado = grupos.find((g) => g.subject.trim().toLowerCase() === nomeAlvo)
        if (!achado) {
            console.error(`[webview] grupo "${alvo.groupName}" não encontrado. Disponíveis:`)
            for (const g of grupos) console.error(`  ${g.subject} -> ${g.jid}`)
            process.exit(1)
        }
        rlog.log(`[webview] "${alvo.groupName}" resolvido -> ${achado.jid}`)
        return achado.jid
    }

    async function enviar(): Promise<void> {
        try {
            const jid = await resolverJid()
            const result = await client.message.send(jid, mensagem())
            const ackError = result.ack?.error
            rlog.log(
                `ENVIO webview(cta_url,full,interaction=${WEBVIEW_INTERACTION}) -> ${alvo.descricao} id=${result.id} attempts=${result.attempts}${
                    ackError ? ` ackError=${ackError}` : ''
                }`
            )
        } catch (error) {
            rlog.log(`ENVIO webview FALHOU: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

    client.on('auth_qr', ({ qr, ttlMs }) => {
        console.log(`\n[qr] escaneie em até ${Math.round(ttlMs / 1000)}s:\n`)
        qrcode.generate(qr, { small: true })
    })
    client.on('auth_paired', ({ credentials }) => {
        console.log(`[paired] pareado como ${credentials.meJid ?? 'desconhecido'}`)
    })
    client.on('connection', (event) => {
        if (event.status === 'open') {
            reconnectAttempt = 0
            console.log(`[connection] aberta (novo login: ${event.isNewLogin})`)
            if (!enviado) {
                enviado = true
                void enviar()
            }
            return
        }
        console.log(`[connection] fechada: ${event.reason} (code=${event.code})`)
        if (event.isLogout) {
            console.error('[connection] device desvinculado; apague .auth/buttons-test.sqlite e pareie de novo')
            return
        }
        void reconnect()
    })
    client.on('message', (event) => {
        logResposta(rlog.log, event.key.remoteJid ?? 'desconhecido', event.key.participant, event.message)
    })

    process.on('SIGINT', () => {
        void client.disconnect().catch(() => undefined).then(() => process.exit(0))
    })

    await client.connect()
    console.log('[main] conectado; aguardando eventos (ctrl+c para sair)')
}

void main().catch((error) => {
    console.error(error)
    process.exit(1)
})
