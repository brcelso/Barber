import React from 'react';
import { CreditCard, Check, X } from 'lucide-react';

export const PlanSelectionModal = ({ show, onClose, onSelect, loading }) => {
    if (!show) return null;

    const plans = [
        {
            id: 'trial',
            name: 'Degustação (Trial)',
            price: 'Grátis',
            period: '3 dias',
            features: [
                'Agenda completa via Web',
                'Visualização de relatórios',
                'Bloqueio de horários',
                'Link de agendamento personalizado'
            ],
            color: 'var(--text-muted)'
        },
        {
            id: 'pro',
            name: 'Barbeiro Pro',
            price: 'R$ 29,90',
            period: '/mês',
            features: [
                'Tudo do Trial+',
                'Bot de WhatsApp Ativo 24h',
                'Notificações de confirmação automáticas',
                'IA para responder clientes',
                'Histórico ilimitado'
            ],
            color: 'var(--primary)',
            popular: true
        },
        {
            id: 'business',
            name: 'Barbearia Plus',
            price: 'R$ 79,90',
            period: '/mês',
            features: [
                'Tudo do Pro+',
                'Gestão de Equipe (até 5 barbeiros)',
                'Painel Administrativo centralizado',
                'Suporte prioritário',
                'Relatórios consolidados de vendas'
            ],
            color: '#3498db'
        }
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="glass-card modal-content" style={{ maxWidth: '900px', width: '95%' }} onClick={e => e.stopPropagation()}>
                <button className="btn-icon" style={{ position: 'absolute', top: '20px', right: '20px' }} onClick={onClose}><X size={20} /></button>

                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <h2 style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '0.5rem' }}>Escolha seu Plano</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Desbloqueie o poder total da automação e gestão.</p>
                </div>

                <div className="barber-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                    {plans.map(plan => (
                        <div
                            key={plan.id}
                            className="glass-card"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                border: plan.popular ? '2px solid var(--primary)' : '1px solid var(--border)',
                                position: 'relative'
                            }}
                        >
                            {plan.popular && (
                                <div style={{
                                    position: 'absolute',
                                    top: '-12px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    background: 'var(--primary)',
                                    color: 'black',
                                    padding: '2px 12px',
                                    borderRadius: '10px',
                                    fontSize: '0.7rem',
                                    fontWeight: 800
                                }}>
                                    MAIS POPULAR
                                </div>
                            )}

                            <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', color: plan.color }}>{plan.name}</h3>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{plan.price}</span>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{plan.period}</span>
                            </div>

                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0', flex: 1 }}>
                                {plan.features.map((f, i) => (
                                    <li key={i} style={{ display: 'flex', gap: '10px', marginBottom: '10px', fontSize: '0.85rem', alignItems: 'flex-start' }}>
                                        <Check size={16} color={plan.color} style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span>{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <button
                                className="btn-primary"
                                style={{
                                    width: '100%',
                                    background: plan.id === 'trial' ? 'transparent' : (plan.popular ? 'var(--primary)' : 'rgba(255,255,255,0.05)'),
                                    border: plan.id === 'trial' ? '1px solid var(--border)' : (plan.popular ? 'none' : '1px solid var(--border)'),
                                    color: plan.popular ? 'black' : 'white'
                                }}
                                onClick={() => onSelect(plan.id)}
                                disabled={loading || plan.id === 'trial'}
                            >
                                {plan.id === 'trial' ? 'Plano Atual' : 'Assinar Agora'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
