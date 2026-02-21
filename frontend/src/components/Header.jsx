import React from 'react';
import { Plus, History, Shield, RefreshCw, LogOut, MessageCircle, CreditCard } from 'lucide-react';

export const Header = ({
    user,
    view,
    setView,
    loading,
    handleRefresh,
    handleLogout,
    subscription,
    setShowPlanSelection,
    handleMockPay,
    handleUpdateProfile,
    handlePromoteToBarber,
    isAdminMode
}) => {
    return (
        <header className="header">
            <div>
                <h1 className="logo-text">✂️ Barber</h1>
                <p style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                    {user.isAdmin && isAdminMode ? 'Relatórios & Gestão' : 'Premium Experience'}
                </p>
            </div>

            <div className="user-nav-group">
                {user.isAdmin && (
                    <div className="subscription-badge" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '0.3rem 0.8rem',
                        background: subscription.daysLeft < 3 ? 'rgba(231, 76, 60, 0.1)' : 'rgba(212, 175, 55, 0.1)',
                        borderRadius: '16px',
                        fontSize: '0.75rem',
                        border: `1px solid ${subscription.daysLeft < 3 ? '#e74c3c' : '#d4af37'}`,
                        marginBottom: '0'
                    }}>
                        <span style={{ color: subscription.daysLeft < 3 ? '#e74c3c' : '#d4af37', fontWeight: 600 }}>
                            {subscription.plan && <span style={{ marginRight: '5px', textTransform: 'uppercase', fontSize: '0.6rem', background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px' }}>{subscription.plan === 'business' ? 'Shop' : subscription.plan}</span>}
                            {subscription.isActive ? `${subscription.daysLeft}d restantes` : 'Expirada!'}
                        </span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {!subscription.trialUsed && (
                                <button
                                    onClick={handleMockPay}
                                    style={{
                                        background: 'rgba(255,255,255,0.08)',
                                        color: 'white',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        padding: '2px 6px',
                                        borderRadius: '6px',
                                        fontSize: '0.6rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                    title="Ativar 3 dias de teste"
                                >
                                    Teste 3d
                                </button>
                            )}
                            <button
                                onClick={() => setShowPlanSelection(true)}
                                style={{
                                    background: 'var(--primary)',
                                    color: 'black',
                                    border: 'none',
                                    padding: '3px 10px',
                                    borderRadius: '8px',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <CreditCard size={10} /> Pagar
                            </button>
                        </div>
                    </div>
                )}

                <nav className="nav-segmented">
                    <button
                        className={`nav-item-fluid ${view === 'book' ? 'active' : ''}`}
                        onClick={() => setView('book')}
                    >
                        <Plus size={18} /> <span>Agendar</span>
                    </button>
                    <button
                        className={`nav-item-fluid ${view === 'history' ? 'active' : ''}`}
                        onClick={() => setView('history')}
                    >
                        <History size={18} /> <span>Histórico</span>
                    </button>
                    {(user.isAdmin || user.isBarber) && (
                        <button
                            className={`nav-item-fluid ${view === 'admin' ? 'active' : ''}`}
                            onClick={() => setView('admin')}
                        >
                            <Shield size={18} /> <span>Admin</span>
                        </button>
                    )}
                </nav>

                <button
                    className="btn-icon"
                    onClick={handleRefresh}
                    title="Atualizar Dados"
                    style={{
                        background: loading ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
                        borderColor: loading ? 'var(--primary)' : 'var(--border)'
                    }}
                >
                    <RefreshCw size={20} className={loading ? 'refresh-spin' : ''} style={{ color: loading ? 'var(--primary)' : 'inherit' }} />
                </button>

                <div className="user-avatar" onClick={() => {
                    const newPhone = prompt('Deseja alterar seu número de WhatsApp?', user.phone);
                    if (newPhone) handleUpdateProfile(newPhone);
                }} title="Editar Perfil" style={{ cursor: 'pointer' }}>
                    <img src={user.picture} alt={user.name} />
                </div>

                {!user.isAdmin && !user.isBarber && (
                    <button
                        className="btn-primary"
                        style={{ fontSize: '0.7rem', padding: '5px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                        onClick={handlePromoteToBarber}
                    >
                        Quero ser Barbeiro
                    </button>
                )}

                <button
                    className="btn-icon"
                    style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', border: '1px solid rgba(37, 211, 102, 0.2)' }}
                    onClick={() => window.open('https://wa.me/5511972509876', '_blank')}
                    title="Falar com Barbeiro"
                >
                    <MessageCircle size={20} />
                </button>

                <button className="btn-icon" onClick={handleLogout} title="Sair"><LogOut size={20} /></button>
            </div>
        </header>
    );
};
