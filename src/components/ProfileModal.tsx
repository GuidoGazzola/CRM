import React, { useState } from 'react';
import { X, Save, User as UserIcon } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useUser } from '../store/UserContext';

interface ProfileModalProps {
    onClose: () => void;
}

export default function ProfileModal({ onClose }: ProfileModalProps) {
    const { user, setUser } = useUser();
    const [name, setName] = useState(user.name === 'Usuario' ? '' : user.name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('El nombre no puede estar vacío');
            return;
        }

        if (!user.id) {
            setError('No se pudo identificar al usuario');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            // Intentamos actualizar la tabla perfiles
            const { error: upsertError } = await supabase
                .from('perfiles')
                .upsert({ id: user.id, nombre: name, rol: user.role }, { onConflict: 'id' });

            if (upsertError) throw upsertError;

            // Actualizar el estado global
            setUser({ ...user, name });
            onClose();
        } catch (err: any) {
            console.error('Error actualizando perfil:', err);
            setError(err.message || 'Error al guardar el perfil');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-lg font-semibold flex items-center">
                        <UserIcon className="w-5 h-5 mr-2 text-indigo-600" />
                        Mi Perfil
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nombre a mostrar
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border outline-none border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Ej. Juan Pérez"
                            disabled={saving}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Este nombre se mostrará en las impresiones de pedidos, presupuestos y tareas.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Correo Electrónico
                        </label>
                        <input
                            type="text"
                            value={user.email || 'No disponible'}
                            disabled
                            className="w-full border border-gray-200 bg-gray-50 rounded-md p-2 text-gray-500 cursor-not-allowed"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rol de Sistema
                        </label>
                        <input
                            type="text"
                            value={user.role === 'admin' ? 'Administrador' : 'Vendedor'}
                            disabled
                            className="w-full border border-gray-200 bg-gray-50 rounded-md p-2 text-gray-500 cursor-not-allowed"
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
                    )}

                    <div className="flex justify-end space-x-2 pt-4 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 border rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
