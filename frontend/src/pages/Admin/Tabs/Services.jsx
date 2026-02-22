import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Package } from 'lucide-react';
import { api } from '../../../services/api';

export const ServicesTab = ({ user, loading: globalLoading }) => {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null); // id do serviço sendo editado
    const [showAdd, setShowAdd] = useState(false);

    const fetchServices = async () => {
        setLoading(true);
        try {
            const data = await api.getAdminServices(user.email);
            setServices(data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchServices(); }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            id: editing?.id,
            name: formData.get('name'),
            price: parseFloat(formData.get('price')),
            duration_minutes: parseInt(formData.get('duration')),
            description: formData.get('description')
        };

        setLoading(true);
        try {
            await api.saveService(user.email, data);
            await fetchServices();
            setEditing(null);
            setShowAdd(false);
        } catch (e) { alert('Erro ao salvar serviço'); }
        finally { setLoading(false); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Excluir este serviço?')) return;
        setLoading(true);
        try {
            await api.deleteService(user.email, id);
            await fetchServices();
        } catch (e) { alert('Erro ao excluir'); }
        finally { setLoading(false); }
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 className="section-title" style={{ margin: 0 }}>
                    <Package size={18} /> Meus Serviços
                </h3>
                <button
                    onClick={() => { setEditing(null); setShowAdd(!showAdd); }}
                    className="btn-primary"
                    style={{ padding: '8px 15px', fontSize: '0.8rem' }}
                >
                    {showAdd ? 'Cancelar' : '+ Novo Serviço'}
                </button>
            </div>

            {(showAdd || editing) && (
                <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>{editing ? 'Editar Serviço' : 'Novo Serviço'}</h4>
                    <form onSubmit={handleSave} style={{ display: 'grid', gap: '15px' }}>
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <input name="name" defaultValue={editing?.name} placeholder="Nome do Serviço (ex: Corte de Cabelo)" className="glass-card" style={{ flex: 2, padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }} required />
                            <input name="price" type="number" step="0.01" defaultValue={editing?.price} placeholder="Preço (R$)" className="glass-card" style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }} required />
                            <input name="duration" type="number" defaultValue={editing?.duration_minutes || 30} placeholder="Duração (min)" className="glass-card" style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)' }} required />
                        </div>
                        <textarea name="description" defaultValue={editing?.description} placeholder="Descrição breve do serviço..." className="glass-card" style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border)', minHeight: '80px' }} />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => { setEditing(null); setShowAdd(false); }} className="btn-icon" style={{ color: 'var(--text-muted)' }}>Cancelar</button>
                            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Serviço'}</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="service-grid">
                {services.map(s => (
                    <div key={s.id} className="glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h4 style={{ margin: 0 }}>{s.name}</h4>
                            <p style={{ margin: '5px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.duration_minutes} min • R$ {s.price?.toFixed(2)}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => { setEditing(s); setShowAdd(false); window.scrollTo(0, 0); }} className="btn-icon" style={{ color: 'var(--primary)' }}><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(s.id)} className="btn-icon" style={{ color: '#e74c3c' }}><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>

            {services.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                    <Package size={40} style={{ marginBottom: '1rem' }} />
                    <p>Você ainda não cadastrou nenhum serviço.</p>
                </div>
            )}
        </div>
    );
};
