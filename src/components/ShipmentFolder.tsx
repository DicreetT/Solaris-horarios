import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Folder } from 'lucide-react';
import { ShipmentFolder as ShipmentFolderType } from '../types';
import { useAuth } from '../context/AuthContext';
import { ShipmentClientCard } from './ShipmentClientCard';
import { useShipments } from '../hooks/useShipments';

interface ShipmentFolderProps {
    folder: ShipmentFolderType;
    defaultExpanded?: boolean;
}

export function ShipmentFolder({ folder, defaultExpanded = false }: ShipmentFolderProps) {
    const { currentUser } = useAuth();
    const { createClient, updateClient, deleteClient } = useShipments(currentUser);
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [isCreatingClient, setIsCreatingClient] = useState(false);
    const [newClientName, setNewClientName] = useState('');

    const formattedDate = new Date(folder.date_key).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClientName.trim()) return;

        try {
            await createClient({
                folderId: folder.id,
                clientName: newClientName
            });
            setNewClientName('');
            setIsCreatingClient(false);
        } catch (error) {
            console.error("Error creating client:", error);
            alert("Error al crear ficha de cliente");
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all hover:shadow-md">
            {/* Header / Toggle */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className={`
                    p-4 flex items-center justify-between cursor-pointer transition-colors
                    ${isExpanded ? 'bg-primary/5 border-b border-primary/10' : 'hover:bg-gray-50'}
                `}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-primary/20 text-primary-dark' : 'bg-gray-100 text-gray-500'}`}>
                        {isExpanded ? <Folder size={20} /> : <Folder size={20} />}
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 capitalize leading-none mb-1">
                            {formattedDate}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                            {folder.clients ? `${folder.clients.length} fichas` : 'Sin fichas'}
                        </p>
                    </div>
                </div>
                <button className="text-gray-400">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
            </div>

            {/* Content (Collapsible) */}
            {isExpanded && (
                <div className="p-4 bg-gray-50/50 animate-[fadeIn_0.2s_ease-out]">

                    {/* Add Client Button */}
                    {!isCreatingClient ? (
                        <button
                            onClick={() => setIsCreatingClient(true)}
                            className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold text-sm hover:border-primary hover:text-primary hover:bg-white transition-all flex items-center justify-center gap-2 mb-4"
                        >
                            <Plus size={18} />
                            Añadir Ficha de Cliente
                        </button>
                    ) : (
                        <form onSubmit={handleCreateClient} className="mb-6 p-4 bg-white rounded-xl border border-primary/20 shadow-sm animate-[popIn_0.2s_ease-out]">
                            <label className="block text-xs font-bold uppercase text-primary mb-2">Nuevo Cliente</label>
                            <div className="flex gap-2">
                                <input
                                    autoFocus
                                    className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                                    placeholder="Nombre del cliente..."
                                    value={newClientName}
                                    onChange={(e) => setNewClientName(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    disabled={!newClientName.trim()}
                                    className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                                >
                                    Crear
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingClient(false)}
                                    className="px-4 py-2 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Client List */}
                    <div className="space-y-4">
                        {folder.clients && folder.clients.length > 0 ? (
                            folder.clients.map(client => (
                                <ShipmentClientCard
                                    key={client.id}
                                    client={client}
                                    onUpdate={(id, updates) => updateClient({ id, updates })}
                                    onDelete={(id) => deleteClient(id)}
                                />
                            ))
                        ) : (
                            !isCreatingClient && (
                                <div className="text-center py-6 text-gray-400 text-sm">
                                    No hay fichas de clientes en esta fecha.
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
