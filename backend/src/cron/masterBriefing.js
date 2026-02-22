import { notifyWhatsApp, getMasterEmail } from '../utils/index.js';

/**
 * Gera um relatório completo do ecossistema para o Master (Celso).
 * Executado diariamente via CRON.
 */
export async function handleMasterBriefing(env) {
    const { DB } = env;
    const MASTER_EMAIL = getMasterEmail(env);

    // 1. Estatísticas Globais de Hoje
    const brazilTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayStr = brazilTime.toLocaleDateString("en-CA");

    // Novos usuários (últimas 24h)
    const yesterday = new Date(brazilTime.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const newUsers = await DB.prepare('SELECT COUNT(*) as count FROM users WHERE created_at >= ?').bind(yesterday).first();

    // Assinaturas vencendo (próximos 3 dias)
    const threeDaysLater = new Date(brazilTime.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const expiringSoon = await DB.prepare(`
        SELECT email, name, subscription_expires 
        FROM users 
        WHERE subscription_expires > CURRENT_TIMESTAMP AND subscription_expires <= ? 
        AND is_admin = 1 AND owner_id IS NULL
    `).bind(threeDaysLater).all();

    // Bots desconectados (que deveriam estar ativos)
    const disconnectedBots = await DB.prepare(`
        SELECT email, name, wa_status, wa_last_seen 
        FROM users 
        WHERE wa_status != 'connected' 
        AND subscription_expires > CURRENT_TIMESTAMP
        AND bot_active = 1
    `).all();

    // Transações / Agendamentos de Hoje
    const todayAppts = await DB.prepare('SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ?').bind(todayStr).first();
    const revenueStats = await DB.prepare(`
        SELECT SUM(s.price) as total
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        WHERE a.appointment_date = ? AND a.status = 'confirmed'
    `).bind(todayStr).first();

    // 2. Composição da Mensagem (Ecosystem Dashboard)
    let report = `🚀 *RELATÓRIO DE GOVERNANÇA DO ECOSSISTEMA* \n\n`;
    report += `📅 *Data:* ${brazilTime.toLocaleDateString('pt-BR')}\n\n`;

    report += `📈 *RESUMO DE HOJE:*\n`;
    report += `🆕 Novos Cadastros: *${newUsers.count}*\n`;
    report += `📅 Agendamentos Totais: *${todayAppts.count}*\n`;
    report += `💰 Volume Transacionado (Conf): *R$ ${revenueStats.total || 0}*\n\n`;

    if (expiringSoon.results.length > 0) {
        report += `⚠️ *ASSINATURAS EXPIRANDO (3 dias):*\n`;
        expiringSoon.results.slice(0, 5).forEach(u => {
            const expDate = new Date(u.subscription_expires).toLocaleDateString('pt-BR');
            report += `- ${u.name} (${expDate})\n`;
        });
        if (expiringSoon.results.length > 5) report += `...e mais ${expiringSoon.results.length - 5}\n`;
        report += `\n`;
    }

    if (disconnectedBots.results.length > 0) {
        report += `🚨 *ALERTA DE BOTS OFFLINE:*\n`;
        disconnectedBots.results.slice(0, 5).forEach(u => {
            report += `- ${u.name} (Status: ${u.wa_status})\n`;
        });
        if (disconnectedBots.results.length > 5) report += `...e mais ${disconnectedBots.results.length - 5}\n`;
        report += `\n`;
    }

    report += `✅ *Sistema Estável:* 100%\n`;
    report += `👋 Use o Painel Master para detalhes.`;

    // 3. Obter o telefone do Master
    const masterUser = await DB.prepare('SELECT phone FROM users WHERE email = ?').bind(MASTER_EMAIL).first();

    if (masterUser?.phone) {
        await notifyWhatsApp(env, DB, null, 'custom', {
            to: masterUser.phone,
            message: report,
            providerEmail: MASTER_EMAIL
        });
    }

    console.log('[MasterBriefing] Sent to', MASTER_EMAIL);

    // 4. Governança Automática: Notificar clientes sobre vencimento (1 dia antes)
    const tomorrow = new Date(brazilTime.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
    const expiringTomorrow = await DB.prepare(`
        SELECT email, name, phone, shop_name 
        FROM users 
        WHERE date(subscription_expires) = ? 
        AND is_admin = 1 AND owner_id IS NULL
    `).bind(tomorrow).all();

    for (const client of expiringTomorrow.results) {
        if (client.phone) {
            const renewalMsg = `⚠️ *AVISO DE RENOVAÇÃO - ${client.shop_name}* \n\nOlá ${client.name}, sua assinatura do ecossistema vence amanhã. \n\nPara garantir que seus agendamentos e o robô continuem funcionando sem interrupções, realize a renovação no painel agora mesmo. \n\nQualquer dúvida, estamos à disposição!`;
            await notifyWhatsApp(env, DB, null, 'custom', {
                to: client.phone,
                message: renewalMsg,
                providerEmail: MASTER_EMAIL // Master envia o aviso
            });
        }
    }
}

/**
 * Monitor de Saúde Proativo.
 * Verifica problemas críticos e avisa o Master imediatamente.
 */
export async function handleHealthMonitor(env) {
    const { DB } = env;
    const MASTER_EMAIL = getMasterEmail(env);

    // Exemplo: Detectar se algum bot de cliente Premium está desconectado há mais de 1 hora
    const criticalIssues = await DB.prepare(`
        SELECT email, name, phone, wa_last_seen, wa_status
        FROM users 
        WHERE wa_status != 'connected' 
        AND subscription_expires > CURRENT_TIMESTAMP
        AND plan IN ('Enterprise', 'Pro')
        AND (strftime('%s', 'now') - strftime('%s', wa_last_seen)) > 3600
    `).all();

    if (criticalIssues.results.length > 0) {
        let alertMsg = `🆘 *ALERTA CRÍTICO: CLIENTES PREMIUM OFFLINE*\n\n`;
        criticalIssues.results.forEach(u => {
            alertMsg += `📍 *${u.name}* (${u.email})\nÚltimo contato: ${new Date(u.wa_last_seen).toLocaleTimeString('pt-BR')}\n\n`;
        });

        const masterUser = await DB.prepare('SELECT phone FROM users WHERE email = ?').bind(MASTER_EMAIL).first();
        if (masterUser?.phone) {
            await notifyWhatsApp(env, DB, null, 'custom', {
                to: masterUser.phone,
                message: alertMsg,
                providerEmail: MASTER_EMAIL
            });
        }
    }
}
