import React from 'react';
import { User, Users, Plus, Trash2, Shield, Activity } from 'lucide-react';

export const TeamTab = ({
    user,
    professionals,
    teamMembers,
    handleAddTeamMember,
    handleRecruitBarber,
    handleRemoveTeamMember,
    handleUpdateTeamMember,
    loading
}) => {
    return (
        <div className="fade-in">
            {/* Adicionar Novo Membro */}
            <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1.2rem' }}>
                    <Plus size={18} /> Adicionar à Equipe
                </h3>
                <form onSubmit={handleAddTeamMember} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                        name="memberName"
                        placeholder="Nome do Profissional"
                        className="glass-card"
                        style={{ flex: 2, minWidth: '150px', padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }}
                        required
                    />
                    <input
                        name="memberEmail"
                        type="email"
                        placeholder="E-mail"
                        className="glass-card"
                        style={{ flex: 2, minWidth: '150px', padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }}
                        required
                    />
                    <button type="submit" className="btn-primary" style={{ flex: 1, minWidth: '100px' }} disabled={loading}>
                        {loading ? '...' : 'Adicionar'}
                    </button>
                </form>

                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>Recrutar profissional existente:</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select
                            id="recruitSelect"
                            className="glass-card"
                            style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }}
                        >
                            <option value="">Selecione um profissional...</option>
                            {professionals.filter(b => !b.ownerId && b.email !== user.email).map(b => (
                                <option key={b.email} value={b.email}>{b.name} ({b.email})</option>
                            ))}
                        </select>
                        <button onClick={handleRecruitBarber} className="btn-primary" style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)' }} disabled={loading}>
                            Recrutar
                        </button>
                    </div>
                </div>
            </div>

            {/* Listagem da Equipe */}
            <h3 className="section-title">Minha Equipe</h3>
            <div className="service-grid">
                {/* O Dono (Sempre primeiro) */}
                <div className="glass-card" style={{ position: 'relative', border: '1px solid var(--primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <img src={user.picture} alt={user.name} style={{ width: '50px', height: '50px', borderRadius: '12px' }} />
                        <div>
                            <h4 style={{ margin: 0 }}>{user.name} (Você)</h4>
                            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 800 }}>PROPRIETÁRIO</p>
                        </div>
                    </div>
                    <div style={{ position: 'absolute', top: '15px', right: '15px', color: 'var(--primary)' }}>
                        <Shield size={18} />
                    </div>
                </div>

                {/* Staff */}
                {teamMembers.filter(b => b.email !== user.email).map(member => (
                    <div key={member.email} className="glass-card" style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <img src={member.picture} alt={member.name} style={{ width: '50px', height: '50px', borderRadius: '12px', opacity: 0.8 }} />
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem' }}>{member.name}</h4>
                                <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{member.email}</p>
                            </div>
                        </div>
                        <button
                            className="btn-icon"
                            style={{ position: 'absolute', top: '10px', right: '10px', color: '#e74c3c', opacity: 0.5 }}
                            onClick={() => handleRemoveTeamMember(member.email)}
                        >
                            <Trash2 size={16} />
                        </button>

                        <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={member.isAdmin}
                                    onChange={e => handleUpdateTeamMember(member.email, { is_admin: e.target.checked, is_barber: member.isBarber })}
                                />
                                Admin
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={member.isBarber}
                                    onChange={e => handleUpdateTeamMember(member.email, { is_admin: member.isAdmin, is_barber: e.target.checked })}
                                />
                                Profissional
                            </label>
                            {member.isBarber && <span className="status-badge confirmed" style={{ fontSize: '0.6rem', padding: '2px 5px' }}>Ativo</span>}
                        </div>
                    </div>
                ))}

                {teamMembers.filter(b => b.email !== user.email).length === 0 && (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '2rem', opacity: 0.3, gridColumn: '1 / -1' }}>
                        <Users size={30} style={{ marginBottom: '0.5rem' }} />
                        <p>Sua equipe está vazia. Adicione profissionais acima.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
