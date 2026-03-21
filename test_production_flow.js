/**
 * Automated Production Flow Test - Universal Scheduler
 * Este script envia requisições REAIS para o seu Worker na Cloudflare.
 */

const WORKER_URL = 'https://barber-server.celsosilvajunior90.workers.dev/api/whatsapp/webhook';

async function sendWebhook(phone, text) {
    console.log(`\n💬 Enviando: "${text}"`);
    const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phone: phone,
            message: text,
             professional_email: 'celsosilvajunior90@gmail.com'
        })
    });
    
    // O Worker responde com status sucesso se processou, mas a mensagem em si
    // vai via sendMessage na Bridge. No entanto, para fins de teste de lógica,
    // o Worker costuma retornar a resposta no corpo quando chamado via API direta.
    try {
        const data = await res.json();
        console.log(`🤖 Resposta do Worker:`, data.aiResponse || data);
        return data;
    } catch (e) {
        console.log('✅ Webhook enviado com sucesso (sem retorno JSON direto).');
    }
}

async function runTest() {
    const testPhone = '5511999999999'; 

    console.log('🚀 Iniciando Teste no Ambiente de Produção (Fluxo 3-Turnos)...');

    // Turno 1: Reset de Sessão e Welcome
    await sendWebhook(testPhone, 'Oi');
    await new Promise(r => setTimeout(r, 2000));

    // Turno 2: Pedido Real (IA)
    await sendWebhook(testPhone, 'Quero marcar um Corte de Cabelo amanhã às 10h');
    console.log('\n⏳ Aguardando IA consultar agenda...');
    await new Promise(r => setTimeout(r, 6000));

    // Turno 3: Confirmação Final
    await sendWebhook(testPhone, 'Sim, pode confirmar agora');

    console.log('\n✅ Teste Finalizado. Verifique os Logs do D1 em instantes.');
}

runTest().catch(console.error);
