import React from 'react';
import { Package, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useShipments } from '../hooks/useShipments';
import { ShipmentFolder } from '../components/ShipmentFolder';

export default function ShipmentsPage() {
    const { currentUser } = useAuth();
    const { shipmentFolders, createFolder, isLoading } = useShipments(currentUser);

    const handleCreateFolder = async () => {
        // Create folder for today
        const todayKey = new Date().toISOString().split('T')[0];
        try {
            await createFolder(todayKey);
        } catch (error: any) {
            console.error("Error creating folder:", error);
            if (error.message.includes("ya existe")) {
                alert(error.message);
            } else {
                alert("Error al crear la carpeta. Es posible que ya exista una carpeta para hoy.");
            }
        }
    };

    return (
        <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-tight mb-2">
                        Envíos
                    </h1>
                    <p className="text-gray-500 font-medium max-w-2xl">
                        Gestiona los envíos diarios y su documentación asociada.
                    </p>
                </div>

                <button
                    onClick={handleCreateFolder}
                    className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 transition-all text-sm"
                >
                    <Plus size={20} />
                    Crear carpeta hoy
                </button>
            </div>

            {/* Folder List */}
            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
                </div>
            ) : (
                <div className="space-y-4">
                    {shipmentFolders && shipmentFolders.length > 0 ? (
                        shipmentFolders.map(folder => (
                            <ShipmentFolder key={folder.id} folder={folder} />
                        ))
                    ) : (
                        <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                            <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Package size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-2">No hay carpetas de envíos</h3>
                            <p className="text-gray-500 max-w-sm mx-auto mb-6">
                                Comienza creando una carpeta para organizar los envíos del día.
                            </p>
                            <button
                                onClick={handleCreateFolder}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all text-sm"
                            >
                                <Plus size={16} />
                                Crear carpeta
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
