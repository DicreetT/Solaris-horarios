import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShoppingBag, MapPin, ArrowRight } from 'lucide-react';
import ShoppingLocationView from '../components/shopping/ShoppingLocationView';
import { useShoppingList } from '../hooks/useShoppingList';

export default function ShoppingListPage() {
    const { currentUser } = useAuth();
    const { shoppingItems } = useShoppingList(currentUser);
    const [selectedLocation, setSelectedLocation] = useState<'canet' | 'huarte' | null>(null);
    const pendingCanetCount = shoppingItems.filter(item => item.location === 'canet' && !item.is_purchased).length;
    const pendingHuarteCount = shoppingItems.filter(item => item.location === 'huarte' && !item.is_purchased).length;

    if (selectedLocation) {
        return (
            <ShoppingLocationView
                location={selectedLocation}
                currentUser={currentUser}
                onBack={() => setSelectedLocation(null)}
            />
        );
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="mb-12 text-center">
                <div className="inline-flex p-4 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 rounded-2xl mb-4 shadow-sm">
                    <ShoppingBag size={48} />
                </div>
                <h1 className="text-5xl font-black text-[var(--color-text)] tracking-tight mb-4">
                    Lista de Compras
                </h1>
                <p className="text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">
                    Selecciona la ubicación para ver o añadir ítems a la lista de compra.
                </p>
            </div>

            {/* Location Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                {/* Canet Card */}
                <button
                    onClick={() => setSelectedLocation('canet')}
                    className="group relative overflow-hidden bg-white border border-gray-200 rounded-3xl p-8 text-left hover:shadow-2xl hover:border-indigo-200 transition-all duration-300 hover:-translate-y-1"
                >
                    <div className="absolute top-0 right-0 p-32 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-8">
                            <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                                <span className="text-4xl">🌊</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {pendingCanetCount > 0 && (
                                    <span className="inline-flex min-w-7 h-7 px-2 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-black">
                                        {pendingCanetCount > 99 ? '99+' : pendingCanetCount}
                                    </span>
                                )}
                                <div className="p-2 bg-gray-50 rounded-full text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <ArrowRight size={24} />
                                </div>
                            </div>
                        </div>

                        <h2 className="text-3xl font-black text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                            Canet
                        </h2>
                        <p className="text-gray-500 font-medium flex items-center gap-2">
                            <MapPin size={18} />
                            Nave Principal
                        </p>
                    </div>
                </button>

                {/* Huarte Card */}
                <button
                    onClick={() => setSelectedLocation('huarte')}
                    className="group relative overflow-hidden bg-white border border-gray-200 rounded-3xl p-8 text-left hover:shadow-2xl hover:border-amber-200 transition-all duration-300 hover:-translate-y-1"
                >
                    <div className="absolute top-0 right-0 p-32 bg-gradient-to-br from-amber-50 to-orange-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-8">
                            <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                                <span className="text-4xl">🏭</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {pendingHuarteCount > 0 && (
                                    <span className="inline-flex min-w-7 h-7 px-2 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-black">
                                        {pendingHuarteCount > 99 ? '99+' : pendingHuarteCount}
                                    </span>
                                )}
                                <div className="p-2 bg-gray-50 rounded-full text-gray-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                    <ArrowRight size={24} />
                                </div>
                            </div>
                        </div>

                        <h2 className="text-3xl font-black text-gray-900 mb-2 group-hover:text-amber-600 transition-colors">
                            Huarte
                        </h2>
                        <p className="text-gray-500 font-medium flex items-center gap-2">
                            <MapPin size={18} />
                            Almacén Secundario
                        </p>
                    </div>
                </button>
            </div>
        </div>
    );
}
