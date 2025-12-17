import React, { useState } from 'react';
import { Paperclip, Tag, FileText, Trash2, PenLine, Plus, X } from 'lucide-react';
import { ShipmentClient, Attachment } from '../types';
import { FileUploader } from './FileUploader';
import { useAuth } from '../context/AuthContext';

interface ShipmentClientCardProps {
    client: ShipmentClient;
    onUpdate: (id: number, updates: Partial<ShipmentClient>) => void;
    onDelete: (id: number) => void;
}

export function ShipmentClientCard({ client, onUpdate, onDelete }: ShipmentClientCardProps) {
    const { currentUser } = useAuth();
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(client.client_name);

    // Save Name
    const handleSaveName = async () => {
        if (nameDraft.trim() !== client.client_name) {
            await onUpdate(client.id, { client_name: nameDraft });
        }
        setIsEditingName(false);
    };

    // Attachments Handling
    const handleUploadInvoices = async (newFiles: Attachment[]) => {
        const updated = [...(client.invoices || []), ...newFiles];
        await onUpdate(client.id, { invoices: updated });
    };

    const handleUploadLabels = async (newFiles: Attachment[]) => {
        const updated = [...(client.labels || []), ...newFiles];
        await onUpdate(client.id, { labels: updated });
    };

    const removeInvoice = async (idx: number) => {
        const updated = client.invoices.filter((_, i) => i !== idx);
        if (window.confirm("¿Eliminar este archivo de facturas?")) {
            await onUpdate(client.id, { invoices: updated });
        }
    };

    const removeLabel = async (idx: number) => {
        const updated = client.labels.filter((_, i) => i !== idx);
        if (window.confirm("¿Eliminar este archivo de etiquetas?")) {
            await onUpdate(client.id, { labels: updated });
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 transition-all hover:shadow-md">
            {/* Header: Client Name */}
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-50">
                <div className="flex-1 mr-4">
                    {isEditingName ? (
                        <div className="flex gap-2">
                            <input
                                autoFocus
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                className="w-full text-lg font-bold text-gray-800 border-b border-primary focus:outline-none"
                                onBlur={handleSaveName}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                            />
                        </div>
                    ) : (
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 group">
                            {client.client_name}
                            <button
                                onClick={() => setIsEditingName(true)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary transition-opacity"
                            >
                                <PenLine size={14} />
                            </button>
                        </h3>
                    )}
                </div>
                <button
                    onClick={() => {
                        if (window.confirm("¿Eliminar esta ficha de cliente?")) onDelete(client.id);
                    }}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Split Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Column: Facturas */}
                <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100 flex flex-col">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-800 mb-3 flex items-center gap-2">
                        <FileText size={14} />
                        Facturas
                    </h4>

                    {/* File List */}
                    <div className="space-y-2 mb-3 flex-1">
                        {client.invoices && client.invoices.length > 0 ? (
                            client.invoices.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-blue-100 shadow-sm text-sm group">
                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-700 hover:underline truncate flex-1">
                                        <Paperclip size={12} className="shrink-0" />
                                        <span className="truncate">{file.name}</span>
                                    </a>
                                    <button onClick={() => removeInvoice(idx)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-blue-400 italic text-center py-2">Sin facturas</p>
                        )}
                    </div>

                    {/* Uploader */}
                    <FileUploader
                        onUploadComplete={handleUploadInvoices}
                        existingFiles={[]} // We don't display preview here, we handle it above
                        maxSizeMB={5}
                        compact
                        resetOnUpload
                    />
                </div>

                {/* Column: Etiquetas */}
                <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-100 flex flex-col">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-800 mb-3 flex items-center gap-2">
                        <Tag size={14} />
                        Etiquetas Envío
                    </h4>

                    {/* File List */}
                    <div className="space-y-2 mb-3 flex-1">
                        {client.labels && client.labels.length > 0 ? (
                            client.labels.map((file, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-purple-100 shadow-sm text-sm group">
                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-purple-700 hover:underline truncate flex-1">
                                        <Tag size={12} className="shrink-0" />
                                        <span className="truncate">{file.name}</span>
                                    </a>
                                    <button onClick={() => removeLabel(idx)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-purple-400 italic text-center py-2">Sin etiquetas</p>
                        )}
                    </div>

                    {/* Uploader */}
                    <FileUploader
                        onUploadComplete={handleUploadLabels}
                        existingFiles={[]}
                        maxSizeMB={5}
                        compact
                        resetOnUpload
                    />
                </div>
            </div>
        </div>
    );
}
