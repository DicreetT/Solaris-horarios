import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, ShoppingCart } from 'lucide-react';
import { ShoppingItem, Attachment } from '../../types';
import { FileUploader } from '../FileUploader';

interface ShoppingItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (item: Omit<ShoppingItem, 'id' | 'created_at' | 'is_purchased' | 'purchased_by'>) => Promise<void>;
    onDelete?: () => Promise<void>;
    initialData?: ShoppingItem;
    location: 'canet' | 'huarte';
    isSubmitting?: boolean;
}

export default function ShoppingItemModal({
    isOpen,
    onClose,
    onSubmit,
    onDelete,
    initialData,
    location,
    isSubmitting = false
}: ShoppingItemModalProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description || '');
                setAttachments(initialData.attachments || []);
            } else {
                setName('');
                setDescription('');
                setAttachments([]);
            }
        }
    }, [isOpen, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        await onSubmit({
            name,
            description,
            location,
            created_by: '', // Will be set by hook
            attachments
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                            <ShoppingCart size={20} />
                        </div>
                        {initialData ? 'Editar Ítem' : 'Añadir a la Lista'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 ml-1">
                            Nombre del producto <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ej: Papel higiénico, Café..."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                            required
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 ml-1">
                            Descripción / Detalles
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Marca específica, cantidad, etc."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[100px] resize-none"
                        />
                    </div>

                    {/* Attachments */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 ml-1">
                            Adjuntar foto o documento
                        </label>
                        <FileUploader
                            folderPath="shopping"
                            onUploadComplete={setAttachments}
                            existingFiles={attachments}
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 flex items-center gap-3">
                        {initialData && onDelete && (
                            <button
                                type="button"
                                onClick={onDelete}
                                className="px-4 py-3 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-bold transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                        <div className="flex-1 flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !name.trim()}
                                className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>Guardando...</>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        {initialData ? 'Guardar Cambios' : 'Añadir a la Lista'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
