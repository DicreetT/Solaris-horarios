import React, { useState } from 'react';
import { X, Calendar as CalendarIcon, MessageSquare } from 'lucide-react';
import { ShoppingItem } from '../../types';

interface PurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { deliveryDate?: string; responseMessage?: string }) => Promise<void>;
    item: ShoppingItem | undefined;
}

export default function PurchaseModal({ isOpen, onClose, onConfirm, item }: PurchaseModalProps) {
    const [deliveryDate, setDeliveryDate] = useState('');
    const [responseMessage, setResponseMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !item) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onConfirm({
                deliveryDate: deliveryDate || undefined,
                responseMessage: responseMessage || undefined,
            });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
            setDeliveryDate('');
            setResponseMessage('');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900">Confirmar Compra</h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Añade detalles sobre la compra de "{item.name}"
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
                    >
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Delivery Date */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <CalendarIcon size={16} />
                            Fecha Estimada de Entrega
                        </label>
                        <input
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                        />
                        <p className="text-xs text-gray-400 mt-1">Opcional. Indica cuándo se espera recibir el ítem.</p>
                    </div>

                    {/* Response Message */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <MessageSquare size={16} />
                            Mensaje de Respuesta
                        </label>
                        <textarea
                            value={responseMessage}
                            onChange={(e) => setResponseMessage(e.target.value)}
                            placeholder="Ej: Comprado en Amazon, llega el martes..."
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all h-32 resize-none"
                        />
                        <p className="text-xs text-gray-400 mt-1">Opcional. Mensaje para {item.created_by}.</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200 hover:shadow-green-300 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Confirmando...' : 'Confirmar Compra'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
