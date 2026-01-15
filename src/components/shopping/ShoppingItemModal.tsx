import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, ShoppingCart, CheckCircle2, Calendar, MessageSquare } from 'lucide-react';
import { ShoppingItem, Attachment } from '../../types';
import { FileUploader } from '../FileUploader';
import { useAuth } from '../../context/AuthContext';
import { ESTEBAN_ID } from '../../constants';

interface ShoppingItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (item: any) => Promise<void>;
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
    const { currentUser } = useAuth();
    const isEsteban = currentUser?.id === ESTEBAN_ID;
    const isCreator = currentUser?.id === initialData?.created_by;
    const canEditPurchase = isEsteban;
    // Show if Esteban OR (Creator and editing existing item)
    const showPurchaseSection = isEsteban || (isCreator && !!initialData);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    // Purchase Fields
    const [isPurchased, setIsPurchased] = useState(false);
    const [deliveryDate, setDeliveryDate] = useState('');
    const [responseMessage, setResponseMessage] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description || '');
                setAttachments(initialData.attachments || []);
                setIsPurchased(initialData.is_purchased);
                setDeliveryDate(initialData.delivery_date ? initialData.delivery_date.split('T')[0] : '');
                setResponseMessage(initialData.response_message || '');
            } else {
                setName('');
                setDescription('');
                setAttachments([]);
                setIsPurchased(false);
                setDeliveryDate('');
                setResponseMessage('');
            }
        }
    }, [isOpen, initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        const submitData: any = {
            name,
            description,
            location,
            attachments
        };

        if (isEsteban) {
            submitData.is_purchased = isPurchased;
            if (isPurchased) {
                // If purchased, include details
                submitData.purchased_by = currentUser?.id;
                submitData.delivery_date = deliveryDate || null;
                submitData.response_message = responseMessage || null;
            } else if (initialData?.is_purchased) {
                // If unmarking as purchased, might want to clear these?
                submitData.delivery_date = null;
                submitData.response_message = null;
                submitData.purchased_by = null;
            }
        }

        // If creating new item, created_by is handled by hook, but fields above work for update too.
        if (!initialData) {
            submitData.created_by = ''; // Hook handles it
        }

        await onSubmit(submitData);
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
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[100px] resize-none"
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

                    {/* Purchase Controls (Visible to Admin and Creator) */}
                    {showPurchaseSection && (
                        <div className="pt-4 border-t border-gray-100 space-y-4">
                            <h3 className="font-bold text-indigo-900 border-b border-indigo-100 pb-2 mb-2 uppercase text-xs tracking-wider flex justify-between items-center">
                                <span>Gestión de Compra</span>
                                {!canEditPurchase && <span className="text-[10px] text-gray-400 normal-case">(Solo lectura)</span>}
                            </h3>

                            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all group bg-gray-50 border-gray-200 ${isPurchased ? 'bg-green-50 border-green-500' : ''} ${!canEditPurchase ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}>
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={isPurchased}
                                        onChange={(e) => setIsPurchased(e.target.checked)}
                                        disabled={!canEditPurchase}
                                        className="peer sr-only"
                                    />
                                    <div className={`w-5 h-5 border-2 rounded-full transition-all ${isPurchased ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}></div>
                                    <CheckCircle2 size={12} className={`absolute top-1 left-1 text-white transition-opacity ${isPurchased ? 'opacity-100' : 'opacity-0'}`} />
                                </div>
                                <div className="flex-1">
                                    <span className={`font-bold block ${isPurchased ? 'text-green-800' : 'text-gray-900'}`}>
                                        {isPurchased ? 'COMPRADO' : 'Marcar como COMPRADO'}
                                    </span>
                                    {isPurchased ? (
                                        <span className="text-xs text-green-600 block">
                                            ¡El ítem ya ha sido comprado!
                                        </span>
                                    ) : (
                                        <span className="text-xs text-gray-500 block">
                                            {canEditPurchase
                                                ? 'El ítem se moverá a la lista de comprados y se notificará al usuario.'
                                                : 'Aún no se ha marcado como comprado.'
                                            }
                                        </span>
                                    )}
                                </div>
                            </label>

                            {/* Details when purchased */}
                            {isPurchased && (
                                <div className="pl-4 border-l-2 border-green-200 space-y-3 animate-in fade-in slide-in-from-top-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-green-800 flex items-center gap-1">
                                            <Calendar size={12} />
                                            Fecha Estimada de Entrega
                                        </label>
                                        <input
                                            type="date"
                                            value={deliveryDate}
                                            onChange={(e) => setDeliveryDate(e.target.value)}
                                            disabled={!canEditPurchase}
                                            className="w-full px-3 py-2 bg-white border border-green-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-green-800 flex items-center gap-1">
                                            <MessageSquare size={12} />
                                            Mensaje de Respuesta
                                        </label>
                                        <textarea
                                            value={responseMessage}
                                            onChange={(e) => setResponseMessage(e.target.value)}
                                            disabled={!canEditPurchase}
                                            placeholder={canEditPurchase ? "Ej: Comprado en Amazon, llega el martes." : "Sin mensaje adjunto."}
                                            className="w-full px-3 py-2 bg-white border border-green-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none min-h-[60px] disabled:bg-gray-50 disabled:text-gray-500"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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
