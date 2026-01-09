import React, { useState } from 'react';
import { Plus, CheckCircle2, Circle, Trash2, FileText, Image as ImageIcon, ArrowLeft, ShoppingBag, Truck, MessageCircle } from 'lucide-react';
import { ShoppingItem, User } from '../../types';
import { useShoppingList } from '../../hooks/useShoppingList';
import { UserAvatar } from '../UserAvatar';
import ShoppingItemModal from './ShoppingItemModal';
import PurchaseModal from './PurchaseModal';
import { formatDatePretty } from '../../utils/dateUtils';
import { ESTEBAN_ID } from '../../constants';

interface ShoppingLocationViewProps {
    location: 'canet' | 'huarte';
    currentUser: User | null;
    onBack: () => void;
}

export default function ShoppingLocationView({ location, currentUser, onBack }: ShoppingLocationViewProps) {
    const { shoppingItems, isLoading, createItem, updateItem, deleteItem, togglePurchased } = useShoppingList(currentUser);
    const [activeTab, setActiveTab] = useState<'pending' | 'purchased'>('pending');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ShoppingItem | undefined>(undefined);

    // Purchase Modal State
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
    const [selectedItemForPurchase, setSelectedItemForPurchase] = useState<ShoppingItem | undefined>(undefined);

    const locationItems = shoppingItems.filter(item => item.location === location);

    const pendingItems = locationItems.filter(item => !item.is_purchased);
    const purchasedItems = locationItems.filter(item => item.is_purchased);

    const displayedItems = activeTab === 'pending' ? pendingItems : purchasedItems;

    const handleCreate = async (itemData: any) => {
        await createItem({ ...itemData, location });
    };

    const handleUpdate = async (itemData: any) => {
        if (!editingItem) return;
        await updateItem({ id: editingItem.id, updates: itemData });
    };

    const handleDelete = async () => {
        if (!editingItem) return;
        if (window.confirm('¿Seguro que quieres eliminar este ítem?')) {
            await deleteItem(editingItem.id);
            setIsModalOpen(false);
        }
    };

    const handleDirectDelete = async (item: ShoppingItem) => {
        if (window.confirm('¿Seguro que quieres eliminar este ítem?')) {
            await deleteItem(item.id);
        }
    };

    const handleTogglePurchased = async (item: ShoppingItem) => {
        if (!item.is_purchased) {
            // Open modal to confirm purchase details
            setSelectedItemForPurchase(item);
            setIsPurchaseModalOpen(true);
        } else {
            // Simply untoggle (revert)
            try {
                await togglePurchased({ id: item.id, isPurchased: false });
            } catch (error: any) {
                alert(error.message);
            }
        }
    };

    const handleConfirmPurchase = async (data: { deliveryDate?: string; responseMessage?: string }) => {
        if (!selectedItemForPurchase) return;
        try {
            await togglePurchased({
                id: selectedItemForPurchase.id,
                isPurchased: true,
                deliveryDate: data.deliveryDate,
                responseMessage: data.responseMessage
            });
            setIsPurchaseModalOpen(false);
            setSelectedItemForPurchase(undefined);
        } catch (error: any) {
            alert(error.message);
        }
    };

    const canEdit = (item: ShoppingItem) => {
        return currentUser?.id === item.created_by || currentUser?.id === ESTEBAN_ID;
    };

    const canDelete = (item: ShoppingItem) => {
        return currentUser?.id === item.created_by;
    };

    const canToggle = currentUser?.id === ESTEBAN_ID;

    return (
        <div className="max-w-5xl mx-auto pb-20">
            {/* Header */}
            <div className="mb-8">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold mb-4 transition-colors"
                >
                    <ArrowLeft size={20} />
                    Volver a ubicaciones
                </button>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight capitalize flex items-center gap-3">
                            <span className="text-indigo-600">
                                {location === 'canet' ? '🌊' : '🏭'}
                            </span>
                            Lista {location}
                        </h1>
                        <p className="text-gray-500 font-medium mt-1">
                            Gestiona las compras para la nave de {location}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setEditingItem(undefined);
                            setIsModalOpen(true);
                        }}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <Plus size={20} />
                        Añadir Ítem
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-gray-100/50 p-1.5 rounded-2xl w-fit">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'pending'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <ShoppingBag size={16} />
                    Pendientes
                    <span className="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full text-xs">
                        {pendingItems.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('purchased')}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'purchased'
                        ? 'bg-white text-green-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <CheckCircle2 size={16} />
                    Comprados
                    <span className="bg-green-100 text-green-600 px-2 py-0.5 rounded-full text-xs">
                        {purchasedItems.length}
                    </span>
                </button>
            </div>

            {/* List */}
            <div className="grid gap-4">
                {displayedItems.length === 0 ? (
                    <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                        <ShoppingBag size={48} className="mx-auto text-gray-300 mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                            {activeTab === 'pending' ? '¡Todo comprado!' : 'No hay compras recientes'}
                        </h3>
                        <p className="text-gray-500 max-w-sm mx-auto">
                            {activeTab === 'pending'
                                ? 'No hay ítems pendientes en la lista. ¡Buen trabajo!'
                                : 'Aún no se ha marcado ningún ítem como comprado.'}
                        </p>
                    </div>
                ) : (
                    displayedItems.map(item => (
                        <div
                            key={item.id}
                            className={`bg-white border rounded-2xl p-5 transition-all group ${item.is_purchased
                                ? 'border-green-100 bg-green-50/30'
                                : 'border-gray-200 hover:border-indigo-200 hover:shadow-md'
                                }`}
                        >
                            <div className="flex items-start gap-4">
                                {/* Checkbox (Only for Esteban) */}
                                <button
                                    onClick={() => handleTogglePurchased(item)}
                                    disabled={!canToggle}
                                    className={`mt-1 p-1 rounded-full transition-colors ${item.is_purchased
                                        ? 'text-green-500 hover:text-green-600'
                                        : canToggle
                                            ? 'text-gray-300 hover:text-indigo-500'
                                            : 'text-gray-200 cursor-not-allowed'
                                        }`}
                                    title={!canToggle ? "Solo Esteban puede marcar como comprado" : "Marcar como comprado"}
                                >
                                    {item.is_purchased ? (
                                        <CheckCircle2 size={24} fill="currentColor" className="text-green-100" />
                                    ) : (
                                        <Circle size={24} />
                                    )}
                                </button>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4">
                                        <div
                                            className={`cursor-pointer ${canEdit(item) ? 'hover:opacity-70' : ''}`}
                                            onClick={() => {
                                                if (canEdit(item)) {
                                                    setEditingItem(item);
                                                    setIsModalOpen(true);
                                                }
                                            }}
                                        >
                                            <h3 className={`font-bold text-lg mb-1 ${item.is_purchased ? 'text-gray-500 line-through' : 'text-gray-900'
                                                }`}>
                                                {item.name}
                                            </h3>
                                            {item.description && (
                                                <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {item.attachments && item.attachments.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {item.attachments.map((att, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={att.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                                            title={att.name}
                                                        >
                                                            {att.type.startsWith('image/') ? <ImageIcon size={14} /> : <FileText size={14} />}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Delete Button (Visible for Creator) */}
                                            {canDelete(item) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDirectDelete(item);
                                                    }}
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Eliminar ítem"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Purchase Details (Only if purchased) */}
                                    {item.is_purchased && (
                                        <div className="mt-3 bg-green-50 rounded-xl p-3 border border-green-100 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
                                            {item.delivery_date && (
                                                <div className="flex items-center gap-2 text-green-800 mb-1">
                                                    <Truck size={14} />
                                                    <span className="font-bold">Llegada estimada:</span>
                                                    <span>{formatDatePretty(new Date(item.delivery_date))}</span>
                                                </div>
                                            )}
                                            {item.response_message && (
                                                <div className="flex items-start gap-2 text-green-700">
                                                    <MessageCircle size={14} className="mt-0.5 shrink-0" />
                                                    <span className="italic">"{item.response_message}"</span>
                                                </div>
                                            )}
                                            {!item.delivery_date && !item.response_message && (
                                                <span className="text-green-600 italic text-xs">Comprado (sin detalles adicionales)</span>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 font-medium">
                                        <div className="flex items-center gap-1.5">
                                            <UserAvatar name={item.created_by} size="xs" />
                                            <span>Añadido por <span className="text-gray-600">{item.created_by}</span></span>
                                        </div>
                                        <span>•</span>
                                        <span>{formatDatePretty(new Date(item.created_at))}</span>

                                        {item.is_purchased && item.purchased_by && (
                                            <>
                                                <span>•</span>
                                                <span className="text-green-600 flex items-center gap-1">
                                                    <CheckCircle2 size={12} />
                                                    Comprado por {item.purchased_by}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <ShoppingItemModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingItem(undefined);
                }}
                onSubmit={editingItem ? handleUpdate : handleCreate}
                onDelete={editingItem && canDelete(editingItem) ? handleDelete : undefined}
                initialData={editingItem}
                location={location}
            />

            <PurchaseModal
                isOpen={isPurchaseModalOpen}
                onClose={() => {
                    setIsPurchaseModalOpen(false);
                    setSelectedItemForPurchase(undefined);
                }}
                onConfirm={handleConfirmPurchase}
                item={selectedItemForPurchase}
            />
        </div>
    );
}
