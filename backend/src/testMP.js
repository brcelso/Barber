/* eslint-disable no-undef */

import 'dotenv/config';
import fetch from 'node-fetch'; // Se seu node for antigo, use o fetch nativo do Node 18+

const MP_TOKEN = process.env.MP_ACCESS_TOKEN?.trim();
const FRONTEND_URL = process.env.FRONTEND_URL?.trim();

async function testMercadoPago() {
    console.log("🚀 Iniciando Teste Direto Mercado Pago...");
    console.log(`🔑 Token (15 primeiros chars): ${MP_TOKEN?.substring(0, 15)}...`);
    console.log(`🔗 URL de Retorno: ${FRONTEND_URL}`);

    if (!MP_TOKEN || MP_TOKEN.length < 20) {
        console.error("❌ ERRO: Token ausente ou muito curto no .env");
        return;
    }

    const body = {
        items: [
            {
                title: "Teste de Integração - Celso",
                quantity: 1,
                unit_price: 5.0, // Valor fixo de R$ 5,00 para teste
                currency_id: "BRL"
            }
        ],
        back_urls: {
            success: FRONTEND_URL || "https://google.com",
            failure: FRONTEND_URL || "https://google.com"
        },
        auto_return: "approved",
        external_reference: "TESTE-ID-123"
    };

    try {
        const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MP_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (response.ok) {
            console.log("\n✅ SUCESSO! O Mercado Pago respondeu corretamente.");
            console.log(`🔗 LINK DE PAGAMENTO: ${data.init_point}`);
            console.log(`🆔 ID DA PREFERÊNCIA: ${data.id}`);
        } else {
            console.log("\n❌ ERRO NA API DO MERCADO PAGO:");
            console.log(JSON.stringify(data, null, 2));
            
            if (data.message?.includes("access_token")) {
                console.log("\n💡 DICA: Seu Token parece estar inválido ou expirado.");
            }
        }
    } catch (error) {
        console.error("\n💥 ERRO DE CONEXÃO:");
        console.error(error.message);
    }
}

testMercadoPago();
