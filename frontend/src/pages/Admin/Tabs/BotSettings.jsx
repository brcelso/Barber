import React from 'react';
import { MessageSquare, Save, Play, Power, Activity } from 'lucide-react';

export const BotSettingsTab = ({
    botSettings,
    setBotSettings,
    handleUpdateBotSettings,
    waStatus,
    loading
}) => {
    return (
        <div className="fade-in">
            {/* Status do WhatsApp */}
            <div className="glass-card" style={{ marginBottom: '2.5rem', border: `1px solid ${waStatus.status === 'connected' ? '#2ecc71' : (waStatus.qr ? 'var(--primary)' : 'var(--border)')}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                        <div className={`status-indicator ${waStatus.status === 'connected' ? 'active' : ''}`} style={{ width: '12px', height: '12px' }}></div>
                        <div>
                            <h3 style={{ margin: 0 }}>Assistente WhatsApp</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {waStatus.status === 'connected' ? 'Robô online e operante' : 'Desconectado ou aguardando QR'}
                            </p>
                        </div>
                    </div>
                </div>

                {!waStatus.qr && waStatus.status !== 'connected' && (
                    <div style={{ marginTop: '1.5rem', textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                        <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>O servidor da ponte está {waStatus.status}.</p>
                        <button className="btn-primary" onClick={() => window.open(`${import.meta.env.VITE_API_URL || 'http://localhost:8787/api'}/admin/bot/start?email=${localStorage.getItem('barber_user') ? JSON.parse(localStorage.getItem('barber_user')).email : ''}`, '_blank')}>
                            <Play size={16} /> Iniciar Servidor Local
                        </button>
                    </div>
                )}

                {waStatus.qr && waStatus.status !== 'connected' && (
                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                        <p style={{ marginBottom: '1rem', color: 'var(--primary)', fontWeight: 700 }}>Escaneie para Conectar:</p>
                        <div style={{ background: 'white', padding: '15px', borderRadius: '15px', display: 'inline-block' }}>
                            <img src={waStatus.qr} alt="QR Code WhatsApp" style={{ width: '200px', height: '200px' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Configurações da IA */}
            <div className="glass-card">
                <h3 className="section-title"><MessageSquare size={20} /> Personalidade & Respostas</h3>
                <form onSubmit={handleUpdateBotSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="form-group">
                        <label>Nome do Robô</label>
                        <input
                            value={botSettings.bot_name}
                            onChange={e => setBotSettings({ ...botSettings, bot_name: e.target.value })}
                            className="glass-card" style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }}
                        />
                    </div>

                    <div className="form-group">
                        <label>Tom de Voz (Personalidade)</label>
                        <input
                            value={botSettings.bot_tone}
                            onChange={e => setBotSettings({ ...botSettings, bot_tone: e.target.value })}
                            placeholder="Ex: prestativo, engraçado, formal..."
                            className="glass-card" style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }}
                        />
                    </div>

                    <div className="form-group">
                        <label>Mensagem de Confirmação (Notificação)</label>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                            Tags: {'{{user_name}}, {{service_name}}, {{barber_name}}, {{date}}, {{time}}'}
                        </p>
                        <textarea
                            rows="4"
                            value={botSettings.welcome_message}
                            onChange={e => setBotSettings({ ...botSettings, welcome_message: e.target.value })}
                            className="glass-card" style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', resize: 'none' }}
                        />
                    </div>

                    <div className="form-group" style={{ padding: '1.5rem', background: 'rgba(212, 175, 55, 0.03)', borderRadius: '15px', border: '1px solid rgba(212, 175, 55, 0.1)' }}>
                        <h4 style={{ color: 'var(--primary)', marginBottom: '1rem', fontSize: '0.9rem' }}>Mensagens do Fluxo (Auto-Agendamento)</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem' }}>1. Saudação de Boas-vindas</label>
                                <textarea rows="2" value={botSettings.msg_welcome} onChange={e => setBotSettings({ ...botSettings, msg_welcome: e.target.value })} className="glass-card" style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem' }}>2. Seleção de Barbeiro</label>
                                <textarea rows="2" value={botSettings.msg_choose_barber} onChange={e => setBotSettings({ ...botSettings, msg_choose_barber: e.target.value })} className="glass-card" style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem' }}>3. Seleção de Serviço</label>
                                <textarea rows="2" value={botSettings.msg_choose_service} onChange={e => setBotSettings({ ...botSettings, msg_choose_service: e.target.value })} className="glass-card" style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem' }}>4. Revisão e Confirmação Final</label>
                                <textarea rows="4" value={botSettings.msg_confirm_booking} onChange={e => setBotSettings({ ...botSettings, msg_confirm_booking: e.target.value })} className="glass-card" style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }} />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }} disabled={loading}>
                        <Save size={18} /> {loading ? 'Salvando...' : 'Salvar Todas as Configurações'}
                    </button>
                </form>
            </div>
        </div>
    );
};
