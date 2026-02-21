import React from 'react';
import { Activity, Users, Shield, Power, CreditCard, RefreshCw, Trash2, Calendar, User, Play } from 'lucide-react';

export const MasterPanelTab = ({
    masterStats,
    masterUsers,
    handleMasterUpdate,
    handleMasterDelete,
    handleMasterRestartBot,
    handleMasterStopBot,
    masterFilter,
    setMasterFilter
}) => {
    if (!masterStats) return <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}><RefreshCw size={32} className="refresh-spin" /></div>;

    const filteredUsers = masterUsers.filter(u => {
        if (masterFilter === 'business') return u.plan === 'business' || u.business_type === 'barbearia';
        if (masterFilter === 'pro') return u.plan === 'pro';
        if (masterFilter === 'staff') return !!u.owner_id;
        return true;
    });

    return (
        <div className="fade-in">
            {/* Estatísticas Globais */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.2rem', marginBottom: '2.5rem' }}>
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <Users size={20} className="text-primary" style={{ marginBottom: '10px' }} />
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{masterStats.totalUsers?.count}</h3>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Usuários Totais</p>
                </div>
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <Shield size={20} style={{ color: '#2ecc71', marginBottom: '10px' }} />
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{masterStats.activeAdmins?.count}</h3>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Admins Ativos</p>
                </div>
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <Activity size={20} style={{ color: '#3498db', marginBottom: '10px' }} />
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{masterStats.connectedBots?.count}</h3>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Bots Conectados</p>
                </div>
                <div className="glass-card" style={{ textAlign: 'center' }}>
                    <Calendar size={20} style={{ color: 'var(--primary)', marginBottom: '10px' }} />
                    <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{masterStats.totalAppointments?.count}</h3>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Agendamentos</p>
                </div>
            </div>

            {/* Lista de Usuários do Sistema */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 className="section-title" style={{ margin: 0 }}>Usuários da Plataforma</h3>
                <div className="nav-segmented" style={{ maxWidth: '400px' }}>
                    <button className={masterFilter === 'all' ? 'active' : ''} onClick={() => setMasterFilter('all')}>Todos</button>
                    <button className={masterFilter === 'business' ? 'active' : ''} onClick={() => setMasterFilter('business')}>Shops</button>
                    <button className={masterFilter === 'pro' ? 'active' : ''} onClick={() => setMasterFilter('pro')}>Pros</button>
                </div>
            </div>

            <div className="admin-appointments-list">
                {filteredUsers.map(u => (
                    <div key={u.email} className="glass-card" style={{ marginBottom: '1rem', padding: '1.2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {u.plan === 'business' ? <Shield size={20} color="var(--primary)" /> : <User size={20} />}
                                </div>
                                <div>
                                    <h4 style={{ margin: 0 }}>{u.name}</h4>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</p>
                                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                                        {u.is_admin === 1 && <span className="status-badge" style={{ fontSize: '0.6rem', padding: '1px 5px', color: 'var(--primary)', border: '1px solid var(--primary)' }}>ADMIN</span>}
                                        {u.plan && <span className="status-badge confirmed" style={{ fontSize: '0.6rem', padding: '1px 5px' }}>{u.plan}</span>}
                                        {u.wa_status === 'connected' && <span className="status-badge" style={{ fontSize: '0.6rem', padding: '1px 5px', background: 'rgba(46,204,113,0.1)', color: '#2ecc71' }}>BOT ON</span>}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <div style={{ textAlign: 'right', marginRight: '10px' }}>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Expira em:</p>
                                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700 }}>{u.subscription_expires ? new Date(u.subscription_expires).toLocaleDateString() : 'N/A'}</p>
                                </div>
                                <button className="btn-icon" onClick={() => handleMasterRestartBot(u.email)} title="Reiniciar Bot"><Play size={16} /></button>
                                <button className="btn-icon" onClick={() => handleMasterStopBot(u.email)} title="Parar Bot"><Power size={16} /></button>
                                <button className="btn-icon" style={{ borderColor: '#e74c3c', color: '#e74c3c' }} onClick={() => handleMasterDelete(u.email)} title="Deletar Usuário"><Trash2 size={16} /></button>
                            </div>
                        </div>

                        {/* Quick Permission Toggles */}
                        <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '20px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={u.is_admin === 1} onChange={e => handleMasterUpdate(u.email, { is_admin: e.target.checked })} />
                                Acesso Admin
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={u.is_barber === 1} onChange={e => handleMasterUpdate(u.email, { is_barber: e.target.checked })} />
                                É Barbeiro
                            </label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
